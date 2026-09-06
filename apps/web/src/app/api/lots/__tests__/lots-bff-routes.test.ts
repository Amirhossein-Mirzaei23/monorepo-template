/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';

import { DELETE } from '../[id]/route';
import { POST } from '../[id]/[action]/route';

/**
 * LOT-005 BFF regression (review fix): the lifecycle actions POSTed by the
 * my-lots UI (/api/lots/:id/{pause,resume,mark-sold,duplicate}) and DELETE
 * /api/lots/:id must actually have BFF routes — the handlers are imported and
 * called directly (middleware.test.ts pattern), with the proxyToApi fetch hop
 * mocked like the component suites mock global.fetch.
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

function request(path: string): NextRequest {
  const headers = new Headers({ authorization: 'Bearer test-access-token' });
  return new NextRequest(new URL(path, BASE_URL), { method: 'POST', headers });
}

interface ProxiedCall {
  url: URL;
  method: string;
  headers: Record<string, string>;
}

function proxiedCalls(): ProxiedCall[] {
  return fetchMock.mock.calls.map(([input, init]) => ({
    url: new URL(String(input)),
    method: String((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase(),
    headers: ((init as RequestInit | undefined)?.headers ?? {}) as Record<string, string>,
  }));
}

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof global.fetch;
  fetchMock.mockResolvedValue(jsonResponse({ id: 'lot-1', status: 'PAUSED' }));
});

describe('POST /api/lots/[id]/[action] (lifecycle allowlist)', () => {
  it.each(['pause', 'resume', 'mark-sold', 'duplicate'])(
    'proxies %s to POST /lots/:id/%s with forwarded auth',
    async (action) => {
      const response = await POST(request(`/api/lots/lot-1/${action}`), {
        params: Promise.resolve({ id: 'lot-1', action }),
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const call = proxiedCalls()[0] as ProxiedCall;
      expect(call.url.pathname).toBe(`/lots/lot-1/${action}`);
      expect(call.method).toBe('POST');
      expect(call.headers.authorization).toBe('Bearer test-access-token');

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ id: 'lot-1', status: 'PAUSED' });
    },
  );

  it('404s an unknown action name without proxying anything', async () => {
    for (const action of ['media', 'restart', 'pause%2F..']) {
      const response = await POST(request(`/api/lots/lot-1/${action}`), {
        params: Promise.resolve({ id: 'lot-1', action }),
      });

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ message: 'Not found' });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes an upstream failure through with its status and body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'Invalid transition' }, 409));

    const response = await POST(request('/api/lots/lot-1/pause'), {
      params: Promise.resolve({ id: 'lot-1', action: 'pause' }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ message: 'Invalid transition' });
  });
});

describe('DELETE /api/lots/[id]', () => {
  it('proxies DELETE to /lots/:id with forwarded auth and the owner body back', async () => {
    const headers = new Headers({ authorization: 'Bearer test-access-token' });
    const deleteRequest = new NextRequest(new URL('/api/lots/lot-1', BASE_URL), {
      method: 'DELETE',
      headers,
    });

    const response = await DELETE(deleteRequest, {
      params: Promise.resolve({ id: 'lot-1' }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = proxiedCalls()[0] as ProxiedCall;
    expect(call.url.pathname).toBe('/lots/lot-1');
    expect(call.method).toBe('DELETE');
    expect(call.headers.authorization).toBe('Bearer test-access-token');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ id: 'lot-1', status: 'PAUSED' });
  });

  it('passes an upstream failure through with its status and body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'Forbidden' }, 403));

    const response = await DELETE(
      new NextRequest(new URL('/api/lots/lot-1', BASE_URL), { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'lot-1' }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ message: 'Forbidden' });
  });
});
