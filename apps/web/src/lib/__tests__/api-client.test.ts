import { apiFetch, ApiError } from '../api-client';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('api-client', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof global.fetch;
  });

  it('returns parsed JSON for successful responses', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ hello: 'world' }));
    await expect(apiFetch<{ hello: string }>('/api/x')).resolves.toEqual({ hello: 'world' });
  });

  it('normalizes API errors into typed ApiError', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ statusCode: 401, error: 'Unauthorized', message: ['Nope', 'Try again'] }, 401),
    );
    const error = await apiFetch('/api/x').catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
    expect((error as ApiError).message).toBe('Nope; Try again');
  });

  it('maps network failures to ApiError with status 0', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const error = await apiFetch('/api/x').catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(0);
    expect((error as ApiError).message).toBe('Network request failed');
  });

  it('returns undefined for 204 responses', async () => {
    fetchMock.mockResolvedValue(jsonResponse(null, 204));
    await expect(apiFetch<void>('/api/x')).resolves.toBeUndefined();
  });

  it('attaches bearer tokens and JSON bodies', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    await apiFetch('/api/x', { method: 'POST', body: { a: 1 }, token: 'tok' });
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/api/x');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(init.body).toBe('{"a":1}');
  });
});
