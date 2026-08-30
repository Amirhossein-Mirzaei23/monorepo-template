import { type NextRequest, NextResponse } from 'next/server';
import { REFRESH_COOKIE_NAME, proxyToApi, upstreamError, upstreamRefreshToken } from '@/lib/bff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * BFF login: proxies credentials to the API, then re-issues the refresh token
 * as an httpOnly cookie scoped to the web origin. The refresh token never
 * appears in the JSON body, so client JS can never read it.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const body = await request.json().catch(() => null);
  if (body === null) {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  const upstream = await proxyToApi(request, 'auth/login', { method: 'POST', body });
  if (!upstream.ok) {
    return upstreamError(upstream);
  }

  const payload = (await upstream.json()) as { accessToken: string; user: unknown };
  const response = NextResponse.json({ accessToken: payload.accessToken, user: payload.user });

  const refresh = upstreamRefreshToken(upstream);
  if (refresh) {
    response.cookies.set({
      name: REFRESH_COOKIE_NAME,
      value: refresh,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });
  }
  return response;
}
