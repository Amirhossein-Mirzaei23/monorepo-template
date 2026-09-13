import { type NextRequest, NextResponse } from 'next/server';
import { proxyToApi, upstreamError } from '@/lib/bff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Allowlist of the DEAL-003 deal actions (the offers [action] BFF precedent —
 * anything outside this set must 404 here instead of being proxied to the API
 * as an arbitrary sub-path). `transition` carries a TransitionDealDto JSON
 * body ({to, note?}), `cancel` the reason ({reason}); payment-confirm is
 * body-less.
 */
const DEAL_ACTIONS: ReadonlySet<string> = new Set<string>([
  'transition',
  'cancel',
  'payment-confirm',
]);

interface RouteContext {
  params: Promise<{ code: string; action: string }>;
}

/** BFF proxy: POST /deals/:code/<action> — every answer is the fresh allowlisted deal. */
export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  const { code, action } = await context.params;
  if (!DEAL_ACTIONS.has(action)) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }

  const body = action === 'payment-confirm' ? undefined : await request.json().catch(() => null);
  if (action !== 'payment-confirm' && body === null) {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  const upstream = await proxyToApi(request, `deals/${encodeURIComponent(code)}/${action}`, {
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
