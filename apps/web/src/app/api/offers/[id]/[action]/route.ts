import { type NextRequest, NextResponse } from 'next/server';
import { proxyToApi, upstreamError } from '@/lib/bff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Allowlist of the OFR-002 offer actions (the lots [action] BFF precedent —
 * anything outside this set must 404 here instead of being proxied to the API
 * as an arbitrary sub-path). `counter` carries a CounterOfferDto JSON body;
 * accept/reject/cancel are body-less.
 */
const OFFER_ACTIONS: ReadonlySet<string> = new Set<string>([
  'counter',
  'accept',
  'reject',
  'cancel',
]);

interface RouteContext {
  params: Promise<{ id: string; action: string }>;
}

/** BFF proxy: POST /offers/:id/<action> — create actions answer 201 (counter), the decisions 200; every body is the fresh offer shape. */
export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  const { id, action } = await context.params;
  if (!OFFER_ACTIONS.has(action)) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }

  const body = action === 'counter' ? await request.json().catch(() => null) : undefined;
  if (action === 'counter' && body === null) {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  const upstream = await proxyToApi(request, `offers/${encodeURIComponent(id)}/${action}`, {
    method: 'POST',
    forwardAuth: true,
    body,
  });
  if (!upstream.ok) {
    return upstreamError(upstream);
  }
  const payload = await upstream.json();
  return NextResponse.json(payload);
}
