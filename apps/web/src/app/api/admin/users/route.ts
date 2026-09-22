import { type NextRequest, NextResponse } from 'next/server';
import { proxyToApi, upstreamError } from '@/lib/bff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * BFF proxy: GET /api/admin/users — the admin users search list (admin panel
 * Task 05). Forwards the Authorization header AND the query string verbatim
 * (q/role/status/accountRole/onboarded/page/limit/sort are the URL-driven
 * filter contract — the list page and the overview deep-links rely on it);
 * the API enforces @Roles(ADMIN), so a USER session gets the upstream 403.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const search = request.nextUrl.search;
  const upstream = await proxyToApi(request, `admin/users${search}`, {
    method: 'GET',
    forwardAuth: true,
  });
  if (!upstream.ok) {
    return upstreamError(upstream);
  }
  const payload = await upstream.json();
  return NextResponse.json(payload);
}
