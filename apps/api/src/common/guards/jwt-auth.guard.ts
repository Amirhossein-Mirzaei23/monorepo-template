import { type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthUser } from '../decorators/current-user.decorator';
import { requireAppConfig } from '../../config/configuration';

type AuthenticatedRequest = Request & { user?: AuthUser };

/**
 * Global JWT guard: every route requires a valid bearer access token unless it
 * is marked @Public(). RBAC is layered on top by RolesGuard.
 */
@Injectable()
export class JwtAuthGuard {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request);

    try {
      const { accessSecret } = requireAppConfig(this.configService).jwt;
      const payload = await this.jwtService.verifyAsync<AuthUser>(token, { secret: accessSecret });
      request.user = {
        sub: payload.sub,
        phone: payload.phone,
        role: payload.role,
        status: payload.status,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  private extractToken(request: AuthenticatedRequest): string {
    const [scheme, token] = (request.headers.authorization ?? '').split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException('Missing bearer access token');
    }
    return token;
  }
}
