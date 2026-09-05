import { type NextRequest, NextResponse } from 'next/server';
import { proxyToApi, upstreamError } from '@/lib/bff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * BFF OTP request: JSON-only proxy to POST /auth/otp/request (AUTH-004). No
 * session is involved, so there is no cookie work — the response body
 * (`expiresAt`, optional `devCode`) passes straight through.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const body = await request.json().catch(() => null);
  if (body === null) {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  const upstream = await proxyToApi(request, 'auth/otp/request', { method: 'POST', body });
  if (!upstream.ok) {
    return upstreamError(upstream);
  }
  return NextResponse.json(await upstream.json());
}
