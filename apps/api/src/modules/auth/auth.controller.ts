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
import type { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { type AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { requireAppConfig } from '../../config/configuration';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH } from './auth.constants';
import type { AuthService } from './auth.service';
import type { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import type { RegisterDto } from './dto/register.dto';

type CookiesRequest = Request & { cookies?: Record<string, string> };

/**
 * Auth endpoints. The refresh token lives in an httpOnly cookie and is only
 * exchanged through the web BFF (`apps/web/src/app/api/auth/*`), so it never
 * reaches browser JS (doc/ARCHITECTURE.md → Security).
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('register')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ type: LoginResponseDto })
  @ApiOperation({ summary: 'Register a user and start a session' })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponseDto> {
    return this.respondWithSession(await this.auth.register(dto), response);
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiOperation({ summary: 'Exchange email + password for tokens (refresh set as cookie)' })
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

  private async respondWithSession(
    session: Awaited<ReturnType<AuthService['login']>>,
    response: Response,
  ): Promise<LoginResponseDto> {
    const options = this.cookieOptions();
    response.cookie(REFRESH_COOKIE_NAME, session.refreshToken, {
      ...options,
      expires: session.refreshExpiresAt,
    });
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
