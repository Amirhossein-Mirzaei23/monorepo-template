import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { UserRole } from '@prisma/client';

/** Access-token payload attached by JwtAuthGuard. */
export interface AuthUser {
  sub: string;
  email: string;
  role: UserRole;
}

export const CurrentUser = createParamDecorator(
  (
    data: keyof AuthUser | undefined,
    context: ExecutionContext,
  ): AuthUser | AuthUser[keyof AuthUser] => {
    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;
    if (!user) {
      throw new Error('CurrentUser used without JwtAuthGuard on the route');
    }
    return data ? user[data] : user;
  },
);
