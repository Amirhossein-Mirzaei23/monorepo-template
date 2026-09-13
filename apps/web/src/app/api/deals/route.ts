import { type NextRequest, NextResponse } from 'next/server';
import { proxyToApi, upstreamError } from '@/lib/bff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * DEAL-004 BFF: GET /deals (role-aware list — `role=buyer|seller` is REQUIRED
 * by the API; query passes through untouched). Deal creation (POST /deals)
 * has no web surface yet (the offers card's «ایجاد معامله» wiring is a
 * documented follow-up), so this route is read-only.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const search = request.nextUrl.search;
  const upstream = await proxyToApi(request, `deals${search}`, {
    method: 'GET',
    forwardAuth: true,
  });
  if (!upstream.ok) {
    return upstreamError(upstream);
  }
  const payload = await upstream.json();
  return NextResponse.json(payload);
}
