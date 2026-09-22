import { type NextRequest, NextResponse } from 'next/server';
import { proxyToApi, upstreamError } from '@/lib/bff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * BFF proxy: PATCH /api/admin/users/:id/role — the explicit role transition
 * (admin panel Task 05). Body is the { role, reason } DTO; a demotion of the
 * last active admin (or self-targeting) comes back as the upstream 409.
 */
export async function PATCH(request: NextRequest, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  if (body === null) {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }
  const upstream = await proxyToApi(request, `admin/users/${encodeURIComponent(id)}/role`, {
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
