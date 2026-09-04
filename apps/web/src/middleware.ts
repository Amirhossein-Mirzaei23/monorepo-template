import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Middleware runs on the edge runtime: keep this file dependency-free.
const REFRESH_COOKIE = 'refresh_token';

/**
 * Authenticated route prefixes (PLAT-002). The marketplace home `/` and the
 * rest of the public shell stay open; `/onboarding` and `/settings` are listed
 * ahead of their cards so future routes are protected the moment they ship.
 */
const PROTECTED_PREFIXES = ['/dashboard', '/onboarding', '/settings'] as const;

/** Segment-boundary prefix match: `/dashboard` and `/dashboard/…`, not `/dashboardx`. */
function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Cheap route protection before rendering (doc/ARCHITECTURE.md → Security):
 * presence of the session cookie gates protected routes; real token validity
 * is enforced by the API/BFF on every request. Mirrors the matcher so the
 * gate holds even if the matcher is ever widened.
 */
export function middleware(request: NextRequest): NextResponse {
  if (!isProtectedPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }
  if (!request.cookies.has(REFRESH_COOKIE)) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/onboarding/:path*', '/settings/:path*'],
};
