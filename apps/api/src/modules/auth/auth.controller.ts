import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { type AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { requireAppConfig } from '../../config/configuration';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { OTP_REQUEST_THROTTLE, REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH } from './auth.constants';
import { AuthService, type Session } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { OtpRequestDto } from './dto/otp-request.dto';
import { OtpRequestResponseDto } from './dto/otp-request-response.dto';
import { OtpVerifyDto } from './dto/otp-verify.dto';
import { OtpVerifyResponseDto } from './dto/otp-verify-response.dto';

type CookiesRequest = Request & { cookies?: Record<string, string> };

/**
 * Auth endpoints. The refresh token lives in an httpOnly cookie and is only
 * exchanged through the web BFF (`apps/web/src/app/api/auth/*`), so it never
 * reaches browser JS (doc/ARCHITECTURE.md → Security).
 *
 * Public identity is phone+OTP (AUTH-003): `/auth/otp/request` + `/auth/otp/verify`
 * (login-or-register). Password login is the retained ADMIN-only path; the old
 * public register endpoint is gone — users register by verifying an OTP, admins
 * are seeded (AUTH-005) / managed under ADMIN-002.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('otp/request')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: { limit: OTP_REQUEST_THROTTLE.limit, ttl: OTP_REQUEST_THROTTLE.ttlMs },
  })
  @ApiOkResponse({ type: OtpRequestResponseDto })
  @ApiOperation({
    summary: 'Request a login OTP for a phone number (stricter throttle: 5/min/IP)',
  })
  async requestOtp(@Body() dto: OtpRequestDto): Promise<OtpRequestResponseDto> {
    return this.auth.requestOtp(dto);
  }

  @Post('otp/verify')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: OtpVerifyResponseDto })
  @ApiOperation({
    summary: 'Verify the OTP and log in (registers the account on first login)',
  })
  async verifyOtp(
    @Body() dto: OtpVerifyDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<OtpVerifyResponseDto> {
    const { onboardingCompleted, ...session } = await this.auth.verifyOtp(dto);
    this.setRefreshCookie(session, response);
    return {
      accessToken: session.accessToken,
      user: session.user,
      onboardingCompleted,
    };
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiOperation({ summary: 'ADMIN-only email + password login (refresh set as cookie)' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponseDto> {
    return this.respondWithSession(await this.auth.login(dto), response);
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiOperation({ summary: 'Rotate the refresh cookie and mint a new access token' })
  async refresh(
    @Req() request: CookiesRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponseDto> {
    const cookie = this.readRefreshCookie(request);
    return this.respondWithSession(await this.auth.refresh(cookie), response);
  }

  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the refresh-cookie session' })
  async logout(
    @Req() request: CookiesRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(this.readRefreshCookie(request));
    response.clearCookie(REFRESH_COOKIE_NAME, this.cookieOptions());
  }

  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOkResponse({ type: UserResponseDto })
  @ApiOperation({ summary: 'Current user profile (requires access token)' })
  async me(@CurrentUser() user: AuthUser): Promise<UserResponseDto> {
    return this.auth.getProfile(user.sub);
  }

  // --- helpers ---

  private setRefreshCookie(session: Session, response: Response): void {
    const options = this.cookieOptions();
    response.cookie(REFRESH_COOKIE_NAME, session.refreshToken, {
      ...options,
      expires: session.refreshExpiresAt,
    });
  }

  private respondWithSession(session: Session, response: Response): LoginResponseDto {
    this.setRefreshCookie(session, response);
    return { accessToken: session.accessToken, user: session.user };
  }

  private readRefreshCookie(request: CookiesRequest): string {
    const cookie = request.cookies?.[REFRESH_COOKIE_NAME];
    if (!cookie || cookie.length === 0) {
      throw new UnauthorizedException('Missing refresh token cookie');
    }
    return cookie;
  }

  private cookieOptions() {
    const config = requireAppConfig(this.config);
    return {
      httpOnly: true,
      secure: config.environment === 'production',
      sameSite: 'lax' as const,
      path: REFRESH_COOKIE_PATH,
    };
  }
}
