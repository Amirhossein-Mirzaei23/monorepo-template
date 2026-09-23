/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';

import { GET } from '../route';

/**
 * Admin categories BFF (Task 06) — GET /api/admin/categories forwards the
 * Authorization header and passes upstream statuses through untouched
 * (users route.test.ts pattern).
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
  fetchMock.mockResolvedValue(jsonResponse([]));
});

describe('GET /api/admin/categories (tree proxy)', () => {
  it('forwards the access token to the upstream admin tree endpoint', async () => {
    const request = new NextRequest(new URL('/api/admin/categories', BASE_URL), {
      headers: new Headers({ authorization: 'Bearer admin-access-token' }),
    });

    const response = await GET(request);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit | undefined];
    const url = new URL(String(input));
    expect(url.pathname).toBe('/admin/categories');
    expect(String(init?.method ?? 'GET').toUpperCase()).toBe('GET');
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.authorization).toBe('Bearer admin-access-token');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
  });

  it('passes an upstream 403 (USER calling an admin endpoint) through untouched', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ statusCode: 403, message: 'Forbidden' }, 403));
    const request = new NextRequest(new URL('/api/admin/categories', BASE_URL));

    const response = await GET(request);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ statusCode: 403, message: 'Forbidden' });
  });
});
