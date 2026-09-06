import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useCategories } from '../hooks/use-categories';

/**
 * Hook test against a mocked BFF (frontend-data.md → Tests): the exact
 * `/api/categories` request, zod-validated payload, and contract-drift error.
 */

const tree = [
  {
    id: 'cat-apparel',
    nameFa: 'پوشاک',
    nameEn: null,
    slug: 'apparel',
    children: [
      { id: 'cat-apparel-men', nameFa: 'مردانه', nameEn: null, slug: 'apparel-men', children: [] },
    ],
  },
];

const fetchMock = jest.fn();

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(
    async () =>
      ({
        ok: true,
        status: 200,
        json: async () => tree,
      }) as unknown as Response,
  );
  global.fetch = fetchMock as unknown as typeof global.fetch;
});

describe('useCategories', () => {
  it('fetches the public tree from the BFF and returns validated data', async () => {
    const { result } = renderHook(() => useCategories(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/categories',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result.current.data).toEqual(tree);
  });

  it('errors on a contract-drifted payload', async () => {
    fetchMock.mockImplementation(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => [{ id: 42 }], // invalid: no nameFa/slug/children
        }) as unknown as Response,
    );
    const { result } = renderHook(() => useCategories(), { wrapper: createWrapper() });

    // The hook retries once (~1s backoff) before surfacing the error.
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 4000 });
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error).toMatchObject({
      message: 'Invalid categories payload received from the API (contract drift?)',
    });
  }, 10000);

  it('exposes a refetch for the retry UI', async () => {
    const { result } = renderHook(() => useCategories(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await act(async () => {
      await result.current.refetch();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
