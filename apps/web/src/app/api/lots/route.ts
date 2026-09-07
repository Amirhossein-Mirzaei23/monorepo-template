import { type NextRequest, NextResponse } from 'next/server';
import { proxyToApi, upstreamError } from '@/lib/bff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * BFF proxy: GET /lots — public lot listing (MKT-001..003): pagination, sort
 * allowlist, filters and `q`, forwarded VERBATIM as the query string so the
 * API's class-validator stays the single validation authority (malformed
 * params surface as the API's 400 → the browse list's error state). No auth.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const upstream = await proxyToApi(request, `lots${request.nextUrl.search}`, { method: 'GET' });
  if (!upstream.ok) {
    return upstreamError(upstream);
  }
  const payload = await upstream.json();
  return NextResponse.json(payload);
}

/** BFF proxy: POST /lots — create a lot as DRAFT or submit for review (bearer required). */
export async function POST(request: NextRequest): Promise<Response> {
  const body = await request.json().catch(() => null);
  if (body === null) {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  const upstream = await proxyToApi(request, 'lots', {
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
