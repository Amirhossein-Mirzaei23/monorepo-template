import { type NextRequest, NextResponse } from 'next/server';
import { proxyToApi, upstreamError } from '@/lib/bff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * BFF proxy: POST /api/admin/users/:id/revoke-sessions — kill every active
 * refresh session of the account (admin panel Task 05). Body is the
 * { reason } DTO; the action is audited server-side.
 */
export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  if (body === null) {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }
  const upstream = await proxyToApi(
    request,
    `admin/users/${encodeURIComponent(id)}/revoke-sessions`,
    {
      method: 'POST',
      forwardAuth: true,
      body,
    },
  );
  if (!upstream.ok) {
    return upstreamError(upstream);
  }
  const payload = await upstream.json();
  return NextResponse.json(payload);
}
