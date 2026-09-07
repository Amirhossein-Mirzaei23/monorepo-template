/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';

import { POST } from '../route';

/**
 * CHT-006 BFF — /api/conversations/:id/read proxies POST /conversations/:id/read
 * (mark my side read): no body, Authorization forwarded, status passed through.
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
});

describe('POST /api/conversations/:id/read (read receipt proxy)', () => {
  it('proxies the read call with auth and returns { readCount }', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ readCount: 4 }));

    const request = new NextRequest(new URL('/api/conversations/conv-1/read', BASE_URL), {
      method: 'POST',
      headers: new Headers({ authorization: 'Bearer test-access-token' }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'conv-1' }) });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit | undefined];
    expect(new URL(String(input)).pathname).toBe('/conversations/conv-1/read');
    expect(String(init?.method ?? '').toUpperCase()).toBe('POST');
    expect(init?.body).toBeUndefined();
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.authorization).toBe('Bearer test-access-token');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ readCount: 4 });
  });

  it('passes an upstream failure through with its status', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'Unauthorized', statusCode: 401 }, 401));

    const request = new NextRequest(new URL('/api/conversations/conv-1/read', BASE_URL), {
      method: 'POST',
      headers: new Headers({ authorization: 'Bearer test-access-token' }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'conv-1' }) });

    expect(response.status).toBe(401);
  });
});
