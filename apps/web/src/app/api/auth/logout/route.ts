import { type NextRequest, NextResponse } from 'next/server';
import { REFRESH_COOKIE_NAME, proxyToApi } from '@/lib/bff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** BFF logout: revokes the session upstream and always clears the cookie. */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    await proxyToApi(request, 'auth/logout', { method: 'POST' });
  } catch {
    // Even if the API is unreachable the browser cookie must be cleared.
  }

  const response = new NextResponse(null, { status: 204 });
  response.cookies.set({
    name: REFRESH_COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return response;
}
