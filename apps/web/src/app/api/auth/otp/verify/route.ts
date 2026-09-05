import { type NextRequest, NextResponse } from 'next/server';
import { REFRESH_COOKIE_NAME, proxyToApi, upstreamError, upstreamRefreshToken } from '@/lib/bff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * BFF OTP verify: proxies the code to the API, then re-issues the refresh
 * token as an httpOnly cookie scoped to the web origin — cookie handling is
 * byte-for-byte the existing login BFF route. The refresh token never appears
 * in the JSON body, so client JS can never read it. `onboardingCompleted`
 * rides along so the client can route to /onboarding vs /dashboard.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const body = await request.json().catch(() => null);
  if (body === null) {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  const upstream = await proxyToApi(request, 'auth/otp/verify', { method: 'POST', body });
  if (!upstream.ok) {
    return upstreamError(upstream);
  }

  const payload = (await upstream.json()) as {
    accessToken: string;
    user: unknown;
    onboardingCompleted: boolean;
  };
  const response = NextResponse.json({
    accessToken: payload.accessToken,
    user: payload.user,
    onboardingCompleted: payload.onboardingCompleted,
  });

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
