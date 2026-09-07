import { type NextRequest, NextResponse } from 'next/server';
import { proxyToApi, upstreamError } from '@/lib/bff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * BFF proxy: GET /conversations — the authenticated chat inbox (CHT-002,
 * consumed by CHT-005). Forwards the pagination query verbatim (page/limit —
 * the API validates, limit capped at 50) and the Authorization header
 * (participant-scoped endpoint, like the /api/lots/mine route).
 */
export async function GET(request: NextRequest): Promise<Response> {
  const upstream = await proxyToApi(request, `conversations${request.nextUrl.search}`, {
    method: 'GET',
    forwardAuth: true,
  });
  if (!upstream.ok) {
    return upstreamError(upstream);
  }
  const payload = await upstream.json();
  return NextResponse.json(payload);
}
