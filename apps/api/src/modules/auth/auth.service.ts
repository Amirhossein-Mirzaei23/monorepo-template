import { compare } from 'bcryptjs';
import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { type User, OtpPurpose, UserRole, UserStatus } from '@prisma/client';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { OtpService, type OtpRequestResult } from '../otp/otp.service';
import { SmsClientType } from '../sms/sms.constants';
import { UsersRepository } from '../users/users.repository';
import { toUserResponse, type UserResponseDto } from '../users/dto/user-response.dto';
import { AUTH_ERROR_CODES, type AuthErrorCode } from './auth.constants';
import type { LoginDto } from './dto/login.dto';
import type { OtpRequestDto } from './dto/otp-request.dto';
import type { OtpVerifyDto } from './dto/otp-verify.dto';
import { TokenService } from './token.service';

/** Compared when the email is unknown so response timing does not leak existence. */
const DUMMY_HASH = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8.PxHqXn5vF/oYHiF7vB/vP/eN9lHy';

/** 403 mapping for non-ACTIVE accounts on the auth entry points (AUTH-003). */
const LOGIN_STATUS_ERRORS: Partial<Record<UserStatus, { code: AuthErrorCode; message: string }>> = {
  [UserStatus.SUSPENDED]: {
    code: AUTH_ERROR_CODES.ACCOUNT_SUSPENDED,
    message: 'This account is suspended — contact support',
  },
  [UserStatus.BLOCKED]: {
    code: AUTH_ERROR_CODES.ACCOUNT_BLOCKED,
    message: 'This account has been blocked — contact support',
  },
  [UserStatus.DELETED]: {
    code: AUTH_ERROR_CODES.ACCOUNT_DELETED,
    message: 'This account has been deleted — contact support to restore it',
  },
};

export interface Session {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: UserResponseDto;
}

/** OTP verify result: the standard session plus the web routing flag. */
export interface OtpSession extends Session {
  onboardingCompleted: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
  ) {}

  /**
   * Email + password login — the retained ADMIN-only path (plan §2.7, D6).
   * Phone-OTP users have no passwordHash, so their password logins fail the
   * credential check; a legacy non-admin account with a password is rejected
   * with 403 here.
   */
  async login(dto: LoginDto): Promise<Session> {
    const user = await this.usersRepository.findByEmail(dto.email);
    const passwordMatches = await compare(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException({
        code: AUTH_ERROR_CODES.ADMIN_ONLY_LOGIN,
        message: 'Password login is restricted to admin accounts',
      });
    }
    this.assertLoginAllowed(user);
    return this.issueSession(user);
  }

  /** Step 1 of phone login: issue (and deliver) a login code. */
  async requestOtp(dto: OtpRequestDto): Promise<OtpRequestResult> {
    return this.otp.request(dto.phone, OtpPurpose.LOGIN, dto.clientType ?? SmsClientType.Web);
  }

  /**
   * Step 2 of phone login: verify the code, then login-or-register — the user
   * row is created on first verification (phone unique, `accountRoles=[]`,
   * status ACTIVE, no password) and the standard session is issued.
   */
  async verifyOtp(dto: OtpVerifyDto): Promise<OtpSession> {
    await this.otp.verify(dto.phone, dto.code, OtpPurpose.LOGIN);
    const user = await this.findOrCreateUserByPhone(dto.phone);
    this.assertLoginAllowed(user);
    return {
      ...(await this.issueSession(user)),
      onboardingCompleted: this.isOnboardingCompleted(user),
    };
  }

  async refresh(refreshToken: string): Promise<Session> {
    const rotated = await this.tokens.rotateRefreshToken(refreshToken);
    const user = await this.usersRepository.findById(rotated.userId);
    if (!user) {
      await this.tokens.revokeAllForUser(rotated.userId);
      throw new UnauthorizedException('User no longer exists');
    }
    return {
      accessToken: await this.tokens.issueAccessToken(user),
      refreshToken: rotated.token,
      refreshExpiresAt: rotated.expiresAt,
      user: toUserResponse(user),
    };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (refreshToken) {
      await this.tokens.revokeRefreshToken(refreshToken);
    }
  }

  async getProfile(userId: AuthUser['sub']): Promise<UserResponseDto> {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }
    return toUserResponse(user);
  }

  /**
   * Placeholder routing hint until ONB-001 lands the Profile check: a user
   * record with a usable name counts as onboarded, so existing flows keep
   * routing to /dashboard. ONB-001 replaces this body with the real
   * profile-completion check — no schema fields are added here.
   */
  private isOnboardingCompleted(user: User): boolean {
    return user.name.trim().length > 0;
  }

  /**
   * Login-or-register by phone. Creation defaults come from the card/plan:
   * `accountRoles=[]`, status ACTIVE, role USER, no password (admins are
   * seeded / managed under ADMIN-002, never self-registered).
   */
  private async findOrCreateUserByPhone(phone: string): Promise<User> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await this.usersRepository.findByPhone(phone, tx);
      if (existing) {
        return existing;
      }
      return this.usersRepository.create(
        {
          phone,
          name: placeholderName(phone),
          passwordHash: null,
        },
        tx,
      );
    });
  }

  /** Non-ACTIVE accounts are rejected with a status-specific 403 body. */
  private assertLoginAllowed(user: User): void {
    const error = LOGIN_STATUS_ERRORS[user.status];
    if (error) {
      throw new ForbiddenException(error);
    }
  }

  private async issueSession(user: User): Promise<Session> {
    const [accessToken, refresh] = await Promise.all([
      this.tokens.issueAccessToken(user),
      this.tokens.issueRefreshToken(user.id),
    ]);
    return {
      accessToken,
      refreshToken: refresh.token,
      refreshExpiresAt: refresh.expiresAt,
      user: toUserResponse(user),
    };
  }
}

/** First-login display name — «کاربر» + masked phone (full numbers never shown). */
function placeholderName(phone: string): string {
  return `کاربر ${phone.slice(0, 4)}***${phone.slice(-3)}`;
}
