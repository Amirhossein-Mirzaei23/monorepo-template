import { type NextRequest, NextResponse } from 'next/server';
import { proxyToApi, upstreamError } from '@/lib/bff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * BFF proxy: GET /api/admin/categories — the FULL two-level category tree
 * (active + inactive rows, per-node lot counts) for the admin editor (admin
 * panel Task 06). Forwards the Authorization header (bearer access token,
 * admin-scoped endpoint — same shape as /api/admin/overview); the API enforces
 * @Roles(ADMIN), so a USER session gets the upstream 403 passed through
 * untouched. Mutations reuse the existing write endpoints through this same
 * prefix (/api/admin/categories/**).
 */
export async function GET(request: NextRequest): Promise<Response> {
  const upstream = await proxyToApi(request, 'admin/categories', {
    method: 'GET',
    forwardAuth: true,
  });
  if (!upstream.ok) {
    return upstreamError(upstream);
  }
  const payload = await upstream.json();
  return NextResponse.json(payload);
}
