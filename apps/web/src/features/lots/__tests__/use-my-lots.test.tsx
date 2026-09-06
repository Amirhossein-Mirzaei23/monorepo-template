import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

// jest.mock's string argument is resolved literally, so the alias fails here.
jest.mock('../../../providers/auth-provider', () => ({
  useAuth: () => ({ accessToken: () => 'test-access-token' }),
}));

import { ownerLotFixture } from '../testing/fixtures';
import { MY_LOTS_PAGE_SIZE, useMyLots, useMyLotsLive, useMyLotsTab } from '../hooks/use-my-lots';

/**
 * useMyLots hook tests (frontend-data.md → Tests): the GET /lots/mine BFF
 * call shape (status/page/limit), infinite pagination across the Paginated
 * envelope (page 1 → 2, then stops), and the merged فعال tab (ACTIVE + PAUSED
 * interleaved newest-first). The tab wrapper exposes the unified list state
 * the panels render.
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

function minePage(status: string, page: number, total: number, ids: string[]) {
  return {
    items: ids.map((id, index) =>
      ownerLotFixture({
        id,
        status: status as never,
        createdAt: `2026-09-0${page}T00:00:0${index}.000Z`,
      }),
    ),
    total,
    page,
    limit: MY_LOTS_PAGE_SIZE,
  };
}

function requestUrl(call: unknown[]): string {
  return String(call[0]);
}

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof global.fetch;
});

describe('useMyLots / useMyLotsTab', () => {
  it('GETs /api/lots/mine with the status tab filter and page params', async () => {
    fetchMock.mockImplementation(async () => ok(minePage('DRAFT', 1, 1, ['lot-1'])));

    const { result } = renderHook(() => useMyLotsTab('DRAFT'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    expect(result.current.items[0]?.id).toBe('lot-1');
    expect(requestUrl(fetchMock.mock.calls[0] as unknown[])).toBe(
      `/api/lots/mine?status=DRAFT&page=1&limit=${MY_LOTS_PAGE_SIZE}`,
    );
  });

  it('walks pages through the sentinel until total is exhausted', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.includes('page=1')) {
        return ok(minePage('ACTIVE', 1, MY_LOTS_PAGE_SIZE + 2, ['a-1', 'a-2']));
      }
      return ok(minePage('ACTIVE', 2, MY_LOTS_PAGE_SIZE + 2, ['a-3', 'a-4']));
    });

    const { result } = renderHook(() => useMyLotsTab('ACTIVE'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.items.map((lot) => lot.id)).toEqual(['a-1', 'a-2']));
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      result.current.fetchNextPage();
    });
    await waitFor(() =>
      expect(result.current.items.map((lot) => lot.id)).toEqual(['a-1', 'a-2', 'a-3', 'a-4']),
    );

    expect(result.current.hasNextPage).toBe(false);
    const urls = fetchMock.mock.calls.map((call) => requestUrl(call as unknown[]));
    expect(urls).toEqual([
      `/api/lots/mine?status=ACTIVE&page=1&limit=${MY_LOTS_PAGE_SIZE}`,
      `/api/lots/mine?status=ACTIVE&page=2&limit=${MY_LOTS_PAGE_SIZE}`,
    ]);
  });

  it('surfaces query errors for the error state', async () => {
    fetchMock.mockImplementation(async () => {
      throw new Error('network down');
    });

    const { result } = renderHook(() => useMyLotsTab('SOLD'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.isError).toBe(true);
    expect(result.current.items).toEqual([]);
  });

  it('useMyLots stays disabled without an access token (the auth-provider contract)', async () => {
    const authMock = jest.requireMock('../../../providers/auth-provider');
    const original = authMock.useAuth;
    authMock.useAuth = () => ({ accessToken: () => undefined });

    try {
      const { result } = renderHook(() => useMyLots('DRAFT'), { wrapper: createWrapper() });
      await act(async () => {});
      expect(result.current.fetchStatus).toBe('idle');
    } finally {
      authMock.useAuth = original;
    }
  });
});

describe('useMyLotsLive (merged فعال tab)', () => {
  it('fetches ACTIVE and PAUSED pages and interleaves them newest-first', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.includes('status=ACTIVE')) {
        return ok(minePage('ACTIVE', 1, 2, ['active-old', 'active-new']));
      }
      return ok(minePage('PAUSED', 1, 1, ['paused-mid']));
    });

    const { result } = renderHook(() => useMyLotsLive(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.items.length).toBe(3));

    const statuses = result.current.items.map((lot) => lot.status);
    expect(statuses).toContain('ACTIVE');
    expect(statuses).toContain('PAUSED');
    // Newest-first across the merged halves:
    const createdAt = result.current.items.map((lot) => new Date(lot.createdAt).getTime());
    const sorted = [...createdAt].sort((a, b) => b - a);
    expect(createdAt).toEqual(sorted);

    const urls = fetchMock.mock.calls.map((call) => requestUrl(call as unknown[]));
    expect(urls.some((url) => url.includes('status=ACTIVE'))).toBe(true);
    expect(urls.some((url) => url.includes('status=PAUSED'))).toBe(true);
  });
});
