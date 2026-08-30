import { compare } from 'bcryptjs';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import type { UsersRepository } from '../users/users.repository';
import type { UsersService } from '../users/users.service';
import { toUserResponse, type UserResponseDto } from '../users/dto/user-response.dto';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import type { TokenService } from './token.service';

/** Compared when the email is unknown so response timing does not leak existence. */
const DUMMY_HASH = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8.PxHqXn5vF/oYHiF7vB/vP/eN9lHy';

export interface Session {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: UserResponseDto;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly usersService: UsersService,
    private readonly tokens: TokenService,
  ) {}

  async login(dto: LoginDto): Promise<Session> {
    const user = await this.usersRepository.findByEmail(dto.email);
    const passwordMatches = await compare(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.issueSession(user);
  }

  async register(dto: RegisterDto): Promise<Session> {
    const created = await this.usersService.create({
      email: dto.email,
      name: dto.name,
      password: dto.password,
    });
    const user = await this.usersRepository.findById(created.id);
    if (!user) {
      throw new UnauthorizedException('Registration failed');
    }
    return this.issueSession(user);
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
