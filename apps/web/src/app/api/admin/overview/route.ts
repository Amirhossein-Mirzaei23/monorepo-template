import { type NextRequest, NextResponse } from 'next/server';
import { proxyToApi, upstreamError } from '@/lib/bff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * BFF proxy: GET /api/admin/overview — the admin workload dashboard's single
 * data source (admin panel Task 04). Forwards the Authorization header
 * (bearer access token, admin-scoped endpoint — same shape as /api/auth/me);
 * the API enforces @Roles(ADMIN), so a USER session gets the upstream 403
 * passed through untouched.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const upstream = await proxyToApi(request, 'admin/overview', {
    method: 'GET',
    forwardAuth: true,
  });
  if (!upstream.ok) {
    return upstreamError(upstream);
  }
  const payload = await upstream.json();
  return NextResponse.json(payload);
}
