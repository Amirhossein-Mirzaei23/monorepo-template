import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { proxyToApi, upstreamError } from '@/lib/bff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** BFF proxy for the public category tree (GET /categories — no auth). */
export async function GET(request: NextRequest): Promise<Response> {
  const upstream = await proxyToApi(request, 'categories', { method: 'GET' });
  if (!upstream.ok) {
    return upstreamError(upstream);
  }
  const payload = await upstream.json();
  return NextResponse.json(payload);
}
