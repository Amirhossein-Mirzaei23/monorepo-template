import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { proxyToApi, upstreamError } from '@/lib/bff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** BFF proxy: PUT /profiles/onboarding (bearer access token required). */
export async function PUT(request: NextRequest): Promise<Response> {
  const upstream = await proxyToApi(request, 'profiles/onboarding', {
    method: 'PUT',
    forwardAuth: true,
  });
  if (!upstream.ok) {
    return upstreamError(upstream);
  }
  const payload = await upstream.json();
  return NextResponse.json(payload);
}
