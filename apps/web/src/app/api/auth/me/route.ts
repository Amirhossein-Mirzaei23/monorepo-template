import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { proxyToApi, upstreamError } from '@/lib/bff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** BFF profile: forwards the bearer access token to GET /auth/me. */
export async function GET(request: NextRequest): Promise<Response> {
  const upstream = await proxyToApi(request, 'auth/me', { method: 'GET', forwardAuth: true });
  if (!upstream.ok) {
    return upstreamError(upstream);
  }
  const payload = await upstream.json();
  return NextResponse.json(payload);
}
