import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

import { useLotsList } from '../hooks/use-lots';
import { LOT_LIST_PAGE_SIZE, type LotsBrowseFilter } from '../schemas/browse-query';
import { cardPageFixture } from '../testing/fixtures';

/**
 * useLots hook tests (frontend-data.md → Tests), driven through useLotsList —
 * the flattened state LotList renders (same shape as the useMyLotsTab tests):
 * the GET /lots BFF call shape (serialized URL filters + page/limit), the page
 * walk across the Paginated envelope, the SSR initialData handoff (page 1
 * fetched exactly once — no SSR/client double fetch), per-page append failure
 * keeping the fetched pages, and a filters change re-issuing the query under a
 * new URL.
 */

const fetchMock = jest.fn();

function createWrapper() {
  const queryClient = new QueryClient({
    // staleTime mirrors the app provider (query-provider.tsx) — required for
    // the initialData test: a stale SSR page WOULD legitimately refetch.
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
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
  global.fetch = fetchMock as unknown as typeof global.fetch;
});

describe('useLotsList', () => {
  it('GETs /api/lots with the serialized filters and pagination', async () => {
    fetchMock.mockResolvedValue(ok(cardPageFixture(1, ['lot-1'], 1)));

    const { result } = renderHook(
      (props: { filters: LotsBrowseFilter }) => useLotsList(props.filters),
      {
        wrapper: createWrapper(),
        initialProps: {
          filters: { q: 'shirt', sort: 'priceAsc', priceMin: 1000 } as LotsBrowseFilter,
        },
      },
    );
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), 'http://test.local');
    expect(url.pathname).toBe('/api/lots');
    expect(url.searchParams.get('q')).toBe('shirt');
    expect(url.searchParams.get('sort')).toBe('priceAsc');
    expect(url.searchParams.get('priceMin')).toBe('1000');
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('limit')).toBe(String(LOT_LIST_PAGE_SIZE));
  });

  it('walks pages through the Paginated envelope until total is exhausted', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.includes('page=1')) {
        return ok(cardPageFixture(1, ['a-1', 'a-2'], 25));
      }
      return ok(cardPageFixture(2, ['a-3'], 25));
    });

    const { result } = renderHook(() => useLotsList({}), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.items.map((lot) => lot.id)).toEqual(['a-1', 'a-2']));
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      result.current.fetchNextPage();
    });
    await waitFor(() =>
      expect(result.current.items.map((lot) => lot.id)).toEqual(['a-1', 'a-2', 'a-3']),
    );

    expect(result.current.hasNextPage).toBe(false);
    const pages = fetchMock.mock.calls.map((call) =>
      new URL(String(call[0]), 'http://test.local').searchParams.get('page'),
    );
    expect(pages).toEqual(['1', '2']);
  });

  it('uses the SSR initial page without refetching page 1 (no double fetch)', async () => {
    const initialPage = cardPageFixture(1, ['ssr-1'], 25);
    fetchMock.mockResolvedValue(ok(cardPageFixture(2, ['client-2'], 25)));

    const { result } = renderHook(() => useLotsList({}, initialPage), { wrapper: createWrapper() });
    await act(async () => {});
    expect(result.current.items.map((lot) => lot.id)).toEqual(['ssr-1']);
    // Page 1 arrived through the RSC handoff — the client only walks forward.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      result.current.fetchNextPage();
    });
    await waitFor(() =>
      expect(result.current.items.map((lot) => lot.id)).toEqual(['ssr-1', 'client-2']),
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('page=2');
  });

  it('keeps the fetched pages when an append fails and retries that page in place', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.includes('page=2')) {
        throw new Error('page 2 down');
      }
      return ok(cardPageFixture(1, ['keep-1'], 25));
    });

    const { result } = renderHook(() => useLotsList({}), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.items.map((lot) => lot.id)).toEqual(['keep-1']));

    await act(async () => {
      result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    // The list is preserved — the failure only breaks the append.
    expect(result.current.items.map((lot) => lot.id)).toEqual(['keep-1']);
    expect(result.current.hasNextPage).toBe(true);

    fetchMock.mockResolvedValue(ok(cardPageFixture(2, ['fixed-2'], 25)));
    await act(async () => {
      result.current.fetchNextPage(); // the retry row's call
    });
    await waitFor(() =>
      expect(result.current.items.map((lot) => lot.id)).toEqual(['keep-1', 'fixed-2']),
    );
    expect(result.current.isError).toBe(false);
  });

  it('re-issues the query with the new URL when the filters change', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const q = new URL(String(input), 'http://test.local').searchParams.get('q') ?? '';
      return ok(cardPageFixture(1, [`lot-${q}`], 1));
    });

    const { result, rerender } = renderHook(
      (props: { filters: LotsBrowseFilter }) => useLotsList(props.filters),
      {
        wrapper: createWrapper(),
        initialProps: { filters: { q: 'shirt' } as LotsBrowseFilter },
      },
    );
    await waitFor(() => expect(result.current.items[0]?.id).toBe('lot-shirt'));

    rerender({ filters: { q: 'jacket', sort: 'priceDesc' } });
    await waitFor(() => expect(result.current.items[0]?.id).toBe('lot-jacket'));

    const queries = fetchMock.mock.calls.map(
      (call) => new URL(String(call[0]), 'http://test.local').searchParams,
    );
    expect(queries[0]?.get('q')).toBe('shirt');
    expect(queries[1]?.get('q')).toBe('jacket');
    expect(queries[1]?.get('sort')).toBe('priceDesc');
  });
});
