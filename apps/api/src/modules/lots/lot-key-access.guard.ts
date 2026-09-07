import { type ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { isLotPublicCode } from './lots.constants';

/** Same request shape JwtAuthGuard authenticates (user attached on success). */
type AuthenticatedRequest = Request & { user?: AuthUser };

/**
 * MKT-009 — route-scoped access guard for the SHARED `GET /lots/:key` path.
 * The plan serves the public detail (`GET /lots/:code`) and the LOT-005 owner
 * read (`GET /lots/:id`) on the same single-segment pattern; Express matches
 * routes in declaration order, so the controller declares ONE `:key` route.
 * The route is `@Public()` (bypasses the global JwtAuthGuard) and this guard
 * re-applies authentication CONDITIONALLY:
 *
 * - key is an 8-char base62 lot code → anonymous allowed (public detail);
 * - anything else (a cuid → owner read) → `super.canActivate` runs the exact
 *   global guard logic (bearer required, `request.user` set for @CurrentUser),
 *   so the owner route's 401/403/404 contract is preserved verbatim.
 */
@Injectable()
export class LotKeyAccessGuard extends JwtAuthGuard {
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const key = request.params.key;
    if (typeof key === 'string' && isLotPublicCode(key)) {
      return true;
    }
    // NOT super.canActivate: it would re-read this route's @Public metadata
    // and skip authentication. authenticate() is the shared verification body
    // (bearer required + request.user attached) without the short-circuit.
    await this.authenticate(request);
    return true;
  }
}
