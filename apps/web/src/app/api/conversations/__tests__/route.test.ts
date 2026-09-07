/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';

import { GET } from '../route';

/**
 * CHT-005 BFF — GET /api/conversations is the authenticated inbox proxy: it
 * must forward the pagination query verbatim (page/limit — the API validates)
 * AND the Authorization header (participant-scoped endpoint; forwardAuth like
 * /api/lots/mine). Handlers are imported and called directly with the
 * proxyToApi fetch hop mocked (lots-bff-routes.test.ts pattern).
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

const INBOX_PAYLOAD = {
  items: [
    {
      id: 'conv-1',
      status: 'ACTIVE',
      lastMessageAt: '2026-09-05T09:30:00.000Z',
      lastMessagePreview: 'سلام',
      isLastMessageSystem: false,
      lot: {
        code: '7Kd2Qm9x',
        title: 'لات',
        coverThumbUrl: null,
        unitPrice: 1000,
        status: 'ACTIVE',
      },
      counterpart: { id: 'user-2', name: 'فروشنده', avatarUrl: null, verified: false },
      myUnreadCount: 1,
      role: 'buyer',
    },
  ],
  total: 1,
  page: 1,
  limit: 20,
};

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof global.fetch;
  fetchMock.mockResolvedValue(jsonResponse(INBOX_PAYLOAD));
});

function inboxRequest(search: string): NextRequest {
  return new NextRequest(new URL(`/api/conversations${search}`, BASE_URL), {
    method: 'GET',
    headers: new Headers({ authorization: 'Bearer test-access-token' }),
  });
}

describe('GET /api/conversations (authenticated inbox proxy)', () => {
  it('forwards the query string verbatim to GET /conversations with auth', async () => {
    const response = await GET(inboxRequest('?page=2&limit=20'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit | undefined];
    const url = new URL(String(input));
    expect(url.pathname).toBe('/conversations');
    expect(url.search).toBe('?page=2&limit=20');
    expect(String(init?.method ?? 'GET').toUpperCase()).toBe('GET');
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.authorization).toBe('Bearer test-access-token');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(INBOX_PAYLOAD);
  });

  it('proxies an empty query string as a plain /conversations call', async () => {
    const response = await GET(inboxRequest(''));

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe('/conversations');
    expect(url.search).toBe('');
    expect(response.status).toBe(200);
  });

  it('passes an upstream failure through with its status and body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'Unauthorized', statusCode: 401 }, 401));

    const response = await GET(inboxRequest(''));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ message: 'Unauthorized', statusCode: 401 });
  });
});
