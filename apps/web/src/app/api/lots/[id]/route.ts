import { type NextRequest, NextResponse } from 'next/server';
import { proxyToApi, upstreamError } from '@/lib/bff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** BFF proxy: GET /lots/:id — owner shape (exactAddress/rejectionReason) for the edit wizard. */
export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  const upstream = await proxyToApi(request, `lots/${encodeURIComponent(id)}`, {
    method: 'GET',
    forwardAuth: true,
  });
  if (!upstream.ok) {
    return upstreamError(upstream);
  }
  const payload = await upstream.json();
  return NextResponse.json(payload);
}

/** BFF proxy: PATCH /lots/:id — edit (DRAFT/REJECTED full; ACTIVE/PAUSED price/quantity only). */
export async function PATCH(request: NextRequest, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  if (body === null) {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  const upstream = await proxyToApi(request, `lots/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    forwardAuth: true,
    body,
  });
  if (!upstream.ok) {
    return upstreamError(upstream);
  }
  const payload = await upstream.json();
  return NextResponse.json(payload);
}

/** BFF proxy: DELETE /lots/:id — soft delete to REMOVED (removed owner body back). */
export async function DELETE(request: NextRequest, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  const upstream = await proxyToApi(request, `lots/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    forwardAuth: true,
  });
  if (!upstream.ok) {
    return upstreamError(upstream);
  }
  const payload = await upstream.json();
  return NextResponse.json(payload);
}
