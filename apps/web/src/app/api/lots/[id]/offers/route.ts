import { type NextRequest, NextResponse } from 'next/server';
import { proxyToApi, upstreamError } from '@/lib/bff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * BFF proxy: GET /lots/:id/offers — the seller's per-lot negotiation history
 * (OFR-002 LotOffersController; the offers module owns the endpoint, the /lots
 * prefix is the resource it lists into). The segment must be named `id` —
 * Next.js forbids two different slug names at the same dynamic level as the
 * sibling `[id]` routes. Query passes through untouched (page/limit/status).
 */
export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  const search = request.nextUrl.search;
  const upstream = await proxyToApi(request, `lots/${encodeURIComponent(id)}/offers${search}`, {
    method: 'GET',
    forwardAuth: true,
  });
  if (!upstream.ok) {
    return upstreamError(upstream);
  }
  const payload = await upstream.json();
  return NextResponse.json(payload);
}
