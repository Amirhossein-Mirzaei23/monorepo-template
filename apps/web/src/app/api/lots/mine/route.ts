import { type NextRequest, NextResponse } from 'next/server';
import { proxyToApi, upstreamError } from '@/lib/bff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * BFF proxy: GET /lots/mine — seller inventory (paginated, optional ?status=
 * tab filter; LOT-005). A STATIC segment next to the dynamic /api/lots/[id]
 * route: Next.js resolves static segments before dynamic ones, so this route
 * wins and `mine` is never mistaken for a lot id.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const upstream = await proxyToApi(request, `lots/mine${request.nextUrl.search}`, {
    method: 'GET',
    forwardAuth: true,
  });
  if (!upstream.ok) {
    return upstreamError(upstream);
  }
  const payload = await upstream.json();
  return NextResponse.json(payload);
}
