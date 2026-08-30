import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Middleware runs on the edge runtime: keep this file dependency-free.
const REFRESH_COOKIE = 'refresh_token';

/**
 * Cheap route protection before rendering (doc/ARCHITECTURE.md → Security):
 * presence of the session cookie gates protected routes; real token validity
 * is enforced by the API/BFF on every request.
 */
export function middleware(request: NextRequest): NextResponse {
  if (!request.cookies.has(REFRESH_COOKIE)) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/dashboard/:path*'],
};
