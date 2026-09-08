import { type NextRequest, NextResponse } from 'next/server';
import { proxyToApi, upstreamError } from '@/lib/bff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * OFR-004 BFF: GET /offers (role-aware list — `role=buyer|seller` is REQUIRED
 * by the API; query passes through untouched) and POST /offers (buyer create;
 * the JSON body forwards as-is, the API owns every validation rule).
 */
export async function GET(request: NextRequest): Promise<Response> {
  const search = request.nextUrl.search;
  const upstream = await proxyToApi(request, `offers${search}`, {
    method: 'GET',
    forwardAuth: true,
  });
  if (!upstream.ok) {
    return upstreamError(upstream);
  }
  const payload = await upstream.json();
  return NextResponse.json(payload);
}

export async function POST(request: NextRequest): Promise<Response> {
  const body = await request.json().catch(() => null);
  if (body === null) {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  const upstream = await proxyToApi(request, 'offers', {
    method: 'POST',
    forwardAuth: true,
    body,
  });
  if (!upstream.ok) {
    return upstreamError(upstream);
  }
  const payload = await upstream.json();
  return NextResponse.json(payload, { status: 201 });
}
