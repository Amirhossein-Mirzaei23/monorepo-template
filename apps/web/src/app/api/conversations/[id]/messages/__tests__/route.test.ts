/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';

import { GET, POST } from '../route';

/**
 * CHT-006 BFF — /api/conversations/:id/messages proxies the CHT-003 thread
 * endpoints: GET forwards the backwards-cursor query verbatim, POST forwards
 * the JSON send body, both forward the Authorization header. Handlers are
 * imported and called directly with the proxyToApi fetch hop mocked
 * (conversations/route.test.ts pattern).
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

const MESSAGE_PAGE = {
  items: [
    {
      id: 'm-1',
      conversationId: 'conv-1',
      senderId: null,
      type: 'SYSTEM',
      body: 'گفتگو درباره: لات — ۱۰۰۰ تومان',
      createdAt: '2026-09-05T00:00:00.000Z',
      readAt: null,
    },
  ],
  hasMore: true,
  nextCursor: 'm-1',
};

const SENT_MESSAGE = {
  id: 'm-2',
  conversationId: 'conv-1',
  senderId: 'user-1',
  type: 'TEXT',
  body: 'سلام',
  createdAt: '2026-09-05T09:00:00.000Z',
  readAt: null,
};

function routeRequest(path: string, method: 'GET' | 'POST', body?: unknown): NextRequest {
  return new NextRequest(new URL(path, BASE_URL), {
    method,
    headers: new Headers({ authorization: 'Bearer test-access-token' }),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof global.fetch;
});

describe('GET /api/conversations/:id/messages (thread history proxy)', () => {
  it('forwards the before/limit query verbatim with auth', async () => {
    fetchMock.mockResolvedValue(jsonResponse(MESSAGE_PAGE));

    const response = await GET(
      routeRequest('/api/conversations/conv-1/messages?before=m-9&limit=30', 'GET'),
      { params: Promise.resolve({ id: 'conv-1' }) },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit | undefined];
    const url = new URL(String(input));
    expect(url.pathname).toBe('/conversations/conv-1/messages');
    expect(url.search).toBe('?before=m-9&limit=30');
    expect(String(init?.method ?? 'GET').toUpperCase()).toBe('GET');
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.authorization).toBe('Bearer test-access-token');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(MESSAGE_PAGE);
  });

  it('passes an upstream failure through with its status and body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'Forbidden', statusCode: 403 }, 403));

    const response = await GET(routeRequest('/api/conversations/conv-foreign/messages', 'GET'), {
      params: Promise.resolve({ id: 'conv-foreign' }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ message: 'Forbidden', statusCode: 403 });
  });
});

describe('POST /api/conversations/:id/messages (send proxy)', () => {
  it('forwards the send body and answers 201 with the created row', async () => {
    fetchMock.mockResolvedValue(jsonResponse(SENT_MESSAGE, 201));

    const response = await POST(
      routeRequest('/api/conversations/conv-1/messages', 'POST', { body: 'سلام' }),
      { params: Promise.resolve({ id: 'conv-1' }) },
    );

    const [input, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit | undefined];
    expect(new URL(String(input)).pathname).toBe('/conversations/conv-1/messages');
    expect(String(init?.method ?? '').toUpperCase()).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ body: 'سلام' });
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.authorization).toBe('Bearer test-access-token');

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(SENT_MESSAGE);
  });

  it('rejects an invalid JSON body locally with 400', async () => {
    const request = new NextRequest(new URL('/api/conversations/conv-1/messages', BASE_URL), {
      method: 'POST',
      headers: new Headers({ authorization: 'Bearer test-access-token' }),
      body: 'not-json',
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'conv-1' }) });

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
