/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';

import { GET } from '../route';

/**
 * Admin-users list BFF (Task 05) — GET /api/admin/users must forward the
 * query string verbatim (the linkable filter contract) plus the Authorization
 * header, and pass upstream statuses through. overview route.test.ts pattern.
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

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof global.fetch;
  fetchMock.mockResolvedValue(jsonResponse({ items: [], total: 0, page: 1, limit: 20 }));
});

describe('GET /api/admin/users (list proxy)', () => {
  it('forwards the query string verbatim plus the access token', async () => {
    const request = new NextRequest(
      new URL('/api/admin/users?status=ACTIVE&q=0912&page=2', BASE_URL),
      { headers: new Headers({ authorization: 'Bearer admin-access-token' }) },
    );

    const response = await GET(request);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit | undefined];
    const url = new URL(String(input));
    expect(url.pathname).toBe('/admin/users');
    expect(url.search).toBe('?status=ACTIVE&q=0912&page=2');
    expect(String(init?.method ?? 'GET').toUpperCase()).toBe('GET');
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.authorization).toBe('Bearer admin-access-token');

    expect(response.status).toBe(200);
  });

  it('passes an upstream 403 (USER calling an admin endpoint) through untouched', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ statusCode: 403, message: 'Forbidden' }, 403));
    const request = new NextRequest(new URL('/api/admin/users', BASE_URL));

    const response = await GET(request);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ statusCode: 403, message: 'Forbidden' });
  });
});
