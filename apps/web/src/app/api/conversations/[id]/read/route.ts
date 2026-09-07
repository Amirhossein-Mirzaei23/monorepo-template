import { type NextRequest, NextResponse } from 'next/server';
import { proxyToApi, upstreamError } from '@/lib/bff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * BFF proxy: POST /conversations/:id/read — mark my side of the thread read
 * (CHT-003, consumed by CHT-006 on thread open / new message while focused).
 * No body; forwards the Authorization header like every conversations route.
 */
export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  const upstream = await proxyToApi(request, `conversations/${encodeURIComponent(id)}/read`, {
    method: 'POST',
    forwardAuth: true,
  });
  if (!upstream.ok) {
    return upstreamError(upstream);
  }
  const payload = await upstream.json();
  return NextResponse.json(payload);
}
