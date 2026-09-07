/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';

import { GET } from '../route';

/**
 * MKT-006 BFF — GET /api/lots is the PUBLIC listing proxy: it must forward the
 * query string verbatim (pagination/sort/filters/q — the API validates) and
 * must NOT forward the Authorization header (no forwardAuth — the endpoint is
 * @Public, a shared browse link must work logged-out). Handlers are imported
 * and called directly with the proxyToApi fetch hop mocked (middleware.test.ts
 * pattern).
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

const LIST_PAYLOAD = {
  items: [{ id: 'clxcard0001', code: '7Kd2Qm9x' }],
  total: 1,
  page: 1,
  limit: 24,
};

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof global.fetch;
  fetchMock.mockResolvedValue(jsonResponse(LIST_PAYLOAD));
});

function publicRequest(search: string): NextRequest {
  return new NextRequest(new URL(`/api/lots${search}`, BASE_URL), {
    method: 'GET',
    headers: new Headers({ cookie: 'refresh_token=should-not-travel' }),
  });
}

describe('GET /api/lots (public listing proxy)', () => {
  it('forwards the query string verbatim to GET /lots without auth', async () => {
    const response = await GET(publicRequest('?sort=priceAsc&page=2&limit=24&q=%D8%AA%DB%8C'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit | undefined];
    const url = new URL(String(input));
    expect(url.pathname).toBe('/lots');
    expect(url.search).toBe('?sort=priceAsc&page=2&limit=24&q=%D8%AA%DB%8C');
    expect(String(init?.method ?? 'GET').toUpperCase()).toBe('GET');
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.authorization).toBeUndefined();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(LIST_PAYLOAD);
  });

  it('proxies an empty query string as a plain /lots call', async () => {
    const response = await GET(publicRequest(''));

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe('/lots');
    expect(url.search).toBe('');
    expect(response.status).toBe(200);
  });

  it('passes an upstream failure through with its status and body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'sort must be one of: …' }, 400));

    const response = await GET(publicRequest('?sort=bogus'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ message: 'sort must be one of: …' });
  });
});
