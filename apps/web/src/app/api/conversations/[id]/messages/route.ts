import { type NextRequest, NextResponse } from 'next/server';
import { proxyToApi, upstreamError } from '@/lib/bff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * BFF proxy: GET+POST /conversations/:id/messages — the thread history and
 * send endpoints (CHT-003, consumed by CHT-006). Mirrors the /api/conversations
 * route: the query string is forwarded verbatim on GET (before/limit — the API
 * validates the cursor and caps the page), POST forwards the JSON body
 * ({ body } — type defaults to TEXT server-side), and both forward the
 * Authorization header (participant-scoped endpoints, like the inbox proxy).
 */
export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  const upstream = await proxyToApi(
    request,
    `conversations/${encodeURIComponent(id)}/messages${request.nextUrl.search}`,
    { method: 'GET', forwardAuth: true },
  );
  if (!upstream.ok) {
    return upstreamError(upstream);
  }
  const payload = await upstream.json();
  return NextResponse.json(payload);
}

export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  if (body === null) {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  const upstream = await proxyToApi(request, `conversations/${encodeURIComponent(id)}/messages`, {
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
