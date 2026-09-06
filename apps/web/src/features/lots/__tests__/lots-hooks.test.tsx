import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

// jest.mock's string argument is resolved literally, so the alias fails here.
jest.mock('../../../providers/auth-provider', () => ({
  useAuth: () => ({ accessToken: () => 'test-access-token' }),
}));

import { ownerLotFixture } from '../testing/fixtures';
import { useCreateLot } from '../hooks/use-create-lot';
import { useLot } from '../hooks/use-lot';
import { useUpdateLot } from '../hooks/use-update-lot';
import { useUpdateLotMedia } from '../hooks/use-update-lot-media';

/**
 * Hook tests against a mocked BFF (frontend-data.md → Tests): method/path per
 * endpoint, payload forwarding, and zod-validated owner responses.
 */

const fetchMock = jest.fn();

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function ok(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => ok(ownerLotFixture()));
  global.fetch = fetchMock as unknown as typeof global.fetch;
});

describe('lot API hooks', () => {
  it('useCreateLot POSTs the payload to /api/lots and returns the owner lot', async () => {
    const { result } = renderHook(() => useCreateLot(), { wrapper: createWrapper() });
    const payload = { title: 'عمده پیراهن مردانه', submit: false };

    await act(async () => {
      result.current.mutate(payload as never);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe('/api/lots');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toMatchObject(payload);
    expect(result.current.data?.id).toBe('lot-1');
  });

  it('useLot GETs the owner shape by id (enabled only with an id)', async () => {
    const { result } = renderHook(() => useLot('lot-1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [path] = fetchMock.mock.calls[0] as unknown as [string];
    expect(path).toBe('/api/lots/lot-1');
    expect(result.current.data?.status).toBe('DRAFT');
  });

  it('useUpdateLot PATCHes /api/lots/:id with the partial payload', async () => {
    const { result } = renderHook(() => useUpdateLot(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ id: 'lot-1', payload: { totalPrice: 120000000 } });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe('/api/lots/lot-1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({ totalPrice: 120000000 });
  });

  it('useUpdateLotMedia PUTs the ordered gallery with coverIndex', async () => {
    const { result } = renderHook(() => useUpdateLotMedia(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({
        id: 'lot-1',
        payload: { items: [{ mediaAssetId: 'asset-1' }], coverIndex: 0 },
      });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe('/api/lots/lot-1/media');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({
      items: [{ mediaAssetId: 'asset-1' }],
      coverIndex: 0,
    });
  });
});
