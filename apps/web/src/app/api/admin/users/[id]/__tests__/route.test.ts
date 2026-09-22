/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';

import { GET } from '../route';
import { PATCH as PATCH_STATUS } from '../status/route';
import { PATCH as PATCH_ROLE } from '../role/route';
import { POST as POST_REVOKE } from '../revoke-sessions/route';

/**
 * Admin-users detail/action BFF (Task 05): GET :id, PATCH :id/status,
 * PATCH :id/role and POST :id/revoke-sessions forward the body and the
 * Authorization header, encode the id, and pass the upstream 409 guard
 * responses (self-action / last-admin) through untouched.
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

function request(path: string, init: Pick<RequestInit, 'method' | 'body'> = {}): NextRequest {
  return new NextRequest(new URL(path, BASE_URL), {
    headers: new Headers({ authorization: 'Bearer admin-access-token' }),
    ...init,
  });
}

const CONTEXT = { params: Promise.resolve({ id: 'abc-123' }) };

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof global.fetch;
  fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
});

describe('GET /api/admin/users/:id (detail proxy)', () => {
  it('proxies the encoded user id with the forwarded token', async () => {
    const response = await GET(request('/api/admin/users/abc-123'), CONTEXT);

    const [input] = fetchMock.mock.calls[0] as unknown as [string];
    expect(new URL(String(input)).pathname).toBe('/admin/users/abc-123');
    expect(response.status).toBe(200);
  });
});

describe('PATCH /api/admin/users/:id/status (action proxy)', () => {
  it('forwards the action body to the upstream status endpoint', async () => {
    const body = { action: 'SUSPEND', reason: 'نقض قوانین پلتفرم' };

    const response = await PATCH_STATUS(
      request('/api/admin/users/abc-123/status', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
      CONTEXT,
    );

    const [input, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(String(input)).pathname).toBe('/admin/users/abc-123/status');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual(body);
    expect(response.status).toBe(200);
  });

  it('rejects an invalid JSON body locally with 400', async () => {
    const response = await PATCH_STATUS(
      request('/api/admin/users/abc-123/status', {
        method: 'PATCH',
        body: 'not-json{',
      }),
      CONTEXT,
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes the upstream 409 guard responses through untouched', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          statusCode: 409,
          error: 'Conflict',
          message: 'self',
          code: 'ADMIN_SELF_ACTION_FORBIDDEN',
        },
        409,
      ),
    );

    const response = await PATCH_STATUS(
      request('/api/admin/users/abc-123/status', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'SUSPEND', reason: 'تلاش روی خودم' }),
      }),
      CONTEXT,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: 'ADMIN_SELF_ACTION_FORBIDDEN',
    });
  });
});

describe('PATCH /api/admin/users/:id/role (action proxy)', () => {
  it('forwards the role body upstream', async () => {
    const body = { role: 'USER', reason: 'سلب دسترسی مدیریتی' };

    await PATCH_ROLE(
      request('/api/admin/users/abc-123/role', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
      CONTEXT,
    );

    const [input, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(String(input)).pathname).toBe('/admin/users/abc-123/role');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual(body);
  });
});

describe('POST /api/admin/users/:id/revoke-sessions (action proxy)', () => {
  it('forwards the reason body upstream as POST', async () => {
    const body = { reason: 'نشست‌های مشکوک' };

    await POST_REVOKE(
      request('/api/admin/users/abc-123/revoke-sessions', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
      CONTEXT,
    );

    const [input, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(String(input)).pathname).toBe('/admin/users/abc-123/revoke-sessions');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual(body);
  });
});
