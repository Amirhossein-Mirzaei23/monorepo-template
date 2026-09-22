/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';

import { GET } from '../route';

/**
 * Admin-overview BFF — GET /api/admin/overview must forward the Authorization
 * header to the @Roles(ADMIN) API route and pass upstream statuses through.
 * Handlers are imported and called directly with the proxyToApi fetch hop
 * mocked (conversations route.test.ts pattern).
 */

const BASE_URL = 'http://localhost:3000';

const fetchMock = jest.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { getSetCookie: (): string[] => [] } as unknown as Headers,
    json: async () => body,
  } as unknown as Response;
}

const OVERVIEW_PAYLOAD = {
  counts: {
    pendingReviewLots: 3,
    openReports: 0,
    pendingVerifications: 0,
    disputedDeals: 1,
    activeUsers: 10,
    suspendedUsers: 2,
    blockedUsers: 0,
    newUsersLast7Days: 4,
  },
  oldestPendingLots: [
    {
      id: 'lot-1',
      code: '7Kd2Qm9x',
      title: 'لات در انتظار بررسی',
      status: 'PENDING_REVIEW',
      createdAt: '2026-09-10T08:00:00.000Z',
    },
  ],
  oldestOpenReports: [],
};

function overviewRequest(): NextRequest {
  return new NextRequest(new URL('/api/admin/overview', BASE_URL), {
    method: 'GET',
    headers: new Headers({ authorization: 'Bearer admin-access-token' }),
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof global.fetch;
  fetchMock.mockResolvedValue(jsonResponse(OVERVIEW_PAYLOAD));
});

describe('GET /api/admin/overview (admin workload proxy)', () => {
  it('proxies GET /admin/overview with the forwarded access token', async () => {
    const response = await GET(overviewRequest());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit | undefined];
    expect(new URL(String(input)).pathname).toBe('/admin/overview');
    expect(String(init?.method ?? 'GET').toUpperCase()).toBe('GET');
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.authorization).toBe('Bearer admin-access-token');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(OVERVIEW_PAYLOAD);
  });

  it('passes an upstream 403 (USER calling an admin endpoint) through untouched', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ statusCode: 403, message: 'Forbidden' }, 403));

    const response = await GET(overviewRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ statusCode: 403, message: 'Forbidden' });
  });
});
