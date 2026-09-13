import { type NextRequest, NextResponse } from 'next/server';
import { proxyToApi, upstreamError } from '@/lib/bff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** DEAL-004 BFF: GET /deals/:code — the detail payload (deal + timeline). */
export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const { code } = await context.params;
  const upstream = await proxyToApi(request, `deals/${encodeURIComponent(code)}`, {
    method: 'GET',
    forwardAuth: true,
  });
  if (!upstream.ok) {
    return upstreamError(upstream);
  }
  const payload = await upstream.json();
  return NextResponse.json(payload);
}

interface RouteContext {
  params: Promise<{ code: string }>;
}
