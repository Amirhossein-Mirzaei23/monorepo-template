/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';

import { GET as listOffers, POST as createOffer } from '../route';
import { POST as offerAction } from '../[id]/[action]/route';
import { GET as lotOffers } from '../../lots/[id]/offers/route';

/**
 * OFR-004 BFF regression: the offers UI's endpoints (/api/offers GET+POST,
 * /api/offers/:id/{counter,accept,reject,cancel} and /api/lots/:id/offers)
 * must actually have BFF routes — handlers imported and called directly with
 * the proxyToApi fetch hop mocked (the lots-bff-routes.test.ts precedent).
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

function request(path: string, init: RequestInit = {}): NextRequest {
  const headers = new Headers({
    authorization: 'Bearer test-access-token',
    ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
  });
  return new NextRequest(new URL(path, BASE_URL), {
    method: init.method,
    body: init.body as BodyInit | undefined,
    headers,
  });
}

interface ProxiedCall {
  url: URL;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function proxiedCalls(): ProxiedCall[] {
  return fetchMock.mock.calls.map(([input, init]) => ({
    url: new URL(String(input)),
    method: String((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase(),
    headers: ((init as RequestInit | undefined)?.headers ?? {}) as Record<string, string>,
    body: JSON.parse(String((init as RequestInit | undefined)?.body ?? 'null')) as unknown,
  }));
}

const OFFER_BODY = {
  id: 'offer-1',
  status: 'PENDING',
  lot: { code: '7Kd2Qm9x', title: 'لات', unitPrice: 300000 },
};

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof global.fetch;
  fetchMock.mockResolvedValue(jsonResponse(OFFER_BODY));
});

describe('GET+POST /api/offers', () => {
  it('proxies the role-aware list with its query string and forwarded auth', async () => {
    const response = await listOffers(request('/api/offers?role=seller&page=1&limit=10'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = proxiedCalls()[0] as ProxiedCall;
    expect(call.url.pathname).toBe('/offers');
    expect(call.url.search).toBe('?role=seller&page=1&limit=10');
    expect(call.method).toBe('GET');
    expect(call.headers.authorization).toBe('Bearer test-access-token');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(OFFER_BODY);
  });

  it('proxies the buyer create with the JSON body and answers its 201', async () => {
    const body = {
      lotId: 'clxdetail01',
      quantity: 45,
      unitPrice: 2250000,
      note: 'تا آخر هفته',
      conversationId: 'conv-1',
    };
    const response = await createOffer(
      request('/api/offers', { method: 'POST', body: JSON.stringify(body) }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = proxiedCalls()[0] as ProxiedCall;
    expect(call.url.pathname).toBe('/offers');
    expect(call.method).toBe('POST');
    expect(call.body).toEqual(body);
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(OFFER_BODY);
  });

  it('400s an invalid JSON create body without proxying', async () => {
    const response = await createOffer(request('/api/offers', { method: 'POST', body: '{oops' }));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes an upstream failure (409 offer rules) through with status and body', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ statusCode: 409, message: 'lot inactive', code: 'LOT_NOT_ACTIVE' }, 409),
    );

    const response = await createOffer(
      request('/api/offers', { method: 'POST', body: JSON.stringify({ lotId: 'x' }) }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      statusCode: 409,
      message: 'lot inactive',
      code: 'LOT_NOT_ACTIVE',
    });
  });
});

describe('POST /api/offers/[id]/[action] (allowlist)', () => {
  it.each(['counter', 'accept', 'reject', 'cancel'])(
    'proxies %s to POST /offers/:id/%s with forwarded auth',
    async (action) => {
      // counter carries a CounterOfferDto; the decisions are body-less.
      const init: RequestInit =
        action === 'counter'
          ? { method: 'POST', body: JSON.stringify({ quantity: 1, unitPrice: 1 }) }
          : { method: 'POST' };
      const response = await offerAction(request(`/api/offers/offer-1/${action}`, init), {
        params: Promise.resolve({ id: 'offer-1', action }),
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const call = proxiedCalls()[0] as ProxiedCall;
      expect(call.url.pathname).toBe('/offers/offer-1/' + action);
      expect(call.method).toBe('POST');
      expect(call.headers.authorization).toBe('Bearer test-access-token');
      expect(response.status).toBe(200);
    },
  );

  it('400s a body-less counter without proxying (CounterOfferDto is required)', async () => {
    const response = await offerAction(request('/api/offers/offer-1/counter', { method: 'POST' }), {
      params: Promise.resolve({ id: 'offer-1', action: 'counter' }),
    });

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards the CounterOfferDto body on counter and nothing on the decisions', async () => {
    const counterBody = { quantity: 40, unitPrice: 310000 };
    await offerAction(
      request('/api/offers/offer-1/counter', {
        method: 'POST',
        body: JSON.stringify(counterBody),
      }),
      { params: Promise.resolve({ id: 'offer-1', action: 'counter' }) },
    );
    await offerAction(request('/api/offers/offer-1/accept', { method: 'POST' }), {
      params: Promise.resolve({ id: 'offer-1', action: 'accept' }),
    });

    const calls = proxiedCalls();
    expect(calls[0]).toMatchObject({ body: counterBody });
    expect(calls[1]).toMatchObject({ body: null });
  });

  it('404s an unknown action name without proxying anything', async () => {
    for (const action of ['decide', 'restart', 'counter%2F..']) {
      const response = await offerAction(
        request(`/api/offers/offer-1/${action}`, { method: 'POST' }),
        {
          params: Promise.resolve({ id: 'offer-1', action }),
        },
      );
      expect(response.status).toBe(404);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/lots/[id]/offers (seller per-lot history)', () => {
  it('proxies to /lots/:id/offers with the query string forwarded', async () => {
    const response = await lotOffers(request('/api/lots/clxdetail01/offers?page=1'), {
      params: Promise.resolve({ id: 'clxdetail01' }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = proxiedCalls()[0] as ProxiedCall;
    expect(call.url.pathname).toBe('/lots/clxdetail01/offers');
    expect(call.url.search).toBe('?page=1');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(OFFER_BODY);
  });
});
