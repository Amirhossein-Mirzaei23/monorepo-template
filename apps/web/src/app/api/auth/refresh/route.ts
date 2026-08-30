import { type NextRequest, NextResponse } from 'next/server';
import { REFRESH_COOKIE_NAME, proxyToApi, upstreamError, upstreamRefreshToken } from '@/lib/bff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** BFF refresh: rotate the httpOnly cookie server-side, return a new access token. */
export async function POST(request: NextRequest): Promise<Response> {
  const upstream = await proxyToApi(request, 'auth/refresh', { method: 'POST' });
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
