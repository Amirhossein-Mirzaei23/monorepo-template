import { type NextRequest, NextResponse } from 'next/server';
import { proxyToApi, upstreamError } from '@/lib/bff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Allowlist of the LOT-003 lifecycle actions. Kept inline (no feature import —
 * BFF routes stay decoupled from features); anything outside this set must 404
 * here instead of being proxied to the API as an arbitrary sub-path.
 */
const LOT_ACTIONS: ReadonlySet<string> = new Set<string>([
  'pause',
  'resume',
  'mark-sold',
  'duplicate',
]);

interface RouteContext {
  params: Promise<{ id: string; action: string }>;
}

/**
 * BFF proxy: POST /lots/:id/<action> — lifecycle transitions (`duplicate`
 * upstream returns 201, the rest 200; every body is the fresh owner shape).
 *
 * Next.js resolves static segments before dynamic ones at the same level, so
 * the sibling static `media` route ([id]/media/route.ts) still claims
 * POST /api/lots/:id/media — this dynamic [action] route never shadows it
 * (and the allowlist would 404 it anyway).
 */
export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  const { id, action } = await context.params;
  if (!LOT_ACTIONS.has(action)) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }

  const upstream = await proxyToApi(request, `lots/${encodeURIComponent(id)}/${action}`, {
    method: 'POST',
    forwardAuth: true,
  });
  if (!upstream.ok) {
    return upstreamError(upstream);
  }
  const payload = await upstream.json();
  return NextResponse.json(payload);
}
