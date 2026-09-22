import { type NextRequest, NextResponse } from 'next/server';
import { proxyToApi, upstreamError } from '@/lib/bff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * BFF proxy: PATCH /api/admin/users/:id/status — the explicit SUSPEND / BLOCK
 * / ACTIVATE / DELETE (soft) transition (admin panel Task 05). Body is the
 * { action, reason } DTO; the API's self-action and last-admin guards answer
 * 409 and are passed through untouched.
 */
export async function PATCH(request: NextRequest, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  if (body === null) {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }
  const upstream = await proxyToApi(request, `admin/users/${encodeURIComponent(id)}/status`, {
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
