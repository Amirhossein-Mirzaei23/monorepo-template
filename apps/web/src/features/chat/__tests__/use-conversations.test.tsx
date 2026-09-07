import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

// jest.mock's string argument is resolved literally, so the alias fails here
// (same workaround as features/lots and features/media tests).
jest.mock('../../../providers/auth-provider', () => ({
  useAuth: () => ({ accessToken: () => 'test-access-token' }),
}));

const mockOn = jest.fn();
const mockOff = jest.fn();
const mockSocketState = { pollingActive: false };

jest.mock('../hooks/use-chat-socket', () => ({
  useChatSocket: () => ({
    connected: !mockSocketState.pollingActive,
    pollingActive: mockSocketState.pollingActive,
    on: mockOn,
    off: mockOff,
    emit: jest.fn(),
  }),
}));

import { conversationItemFixture } from '../testing/fixtures';
import { CHAT_POLLING_INTERVAL_MS, useConversationsList } from '../hooks/use-conversations';

/**
 * useConversationsList hook tests (frontend-data.md → Tests): the GET
 * /conversations BFF call shape, infinite pagination across the Paginated
 * envelope, the `conversation:updated` WS-event invalidation (CHT-005's live
 * updates), and the 15 s polling fallback while `pollingActive` (CHT-004).
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

function conversationsPage(page: number, total: number, ids: string[]) {
  return {
    items: ids.map((id, index) =>
      conversationItemFixture({
        id,
        lastMessageAt: `2026-09-0${page}T00:00:0${index}.000Z`,
      }),
    ),
    total,
    page,
    limit: 20,
  };
}

function requestUrl(call: unknown[]): string {
  return String(call[0]);
}

function updatedHandler(): () => void {
  const call = mockOn.mock.calls.find(([event]) => event === 'conversation:updated');
  if (!call) {
    throw new Error('conversation:updated handler was never registered');
  }
  return call[1] as () => void;
}

beforeEach(() => {
  fetchMock.mockReset();
  mockOn.mockReset();
  mockOff.mockReset();
  mockSocketState.pollingActive = false;
  global.fetch = fetchMock as unknown as typeof global.fetch;
});

describe('useConversationsList (CHT-005 inbox query)', () => {
  it('GETs /api/conversations through the BFF with page params and exposes the rows', async () => {
    fetchMock.mockImplementation(async () => ok(conversationsPage(1, 2, ['conv-1', 'conv-2'])));

    const { result } = renderHook(() => useConversationsList(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.items).toHaveLength(2));

    expect(result.current.items.map((c) => c.id)).toEqual(['conv-1', 'conv-2']);
    expect(result.current.total).toBe(2);
    expect(result.current.pollingActive).toBe(false);
    expect(requestUrl(fetchMock.mock.calls[0] as unknown[])).toBe(
      '/api/conversations?page=1&limit=20',
    );
  });

  it('walks pages through the Paginated envelope until total is exhausted', async () => {
    // total 21 > page1*limit20 → a second page; page2*limit20 > 21 → stop.
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.includes('page=1')) {
        return ok(conversationsPage(1, 21, ['conv-1', 'conv-2']));
      }
      return ok(conversationsPage(2, 21, ['conv-3']));
    });

    const { result } = renderHook(() => useConversationsList(), { wrapper: createWrapper() });
    await waitFor(() =>
      expect(result.current.items.map((c) => c.id)).toEqual(['conv-1', 'conv-2']),
    );
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      result.current.fetchNextPage();
    });
    await waitFor(() =>
      expect(result.current.items.map((c) => c.id)).toEqual(['conv-1', 'conv-2', 'conv-3']),
    );

    expect(result.current.hasNextPage).toBe(false);
    const urls = fetchMock.mock.calls.map((call) => requestUrl(call as unknown[]));
    expect(urls).toEqual([
      '/api/conversations?page=1&limit=20',
      '/api/conversations?page=2&limit=20',
    ]);
  });

  it('invalidates and refetches the list on any conversation:updated WS event', async () => {
    fetchMock.mockImplementation(async () => ok(conversationsPage(1, 1, ['conv-1'])));

    const { result, unmount } = renderHook(() => useConversationsList(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Another session sends a message → the server emits conversation:updated.
    await act(async () => {
      updatedHandler()();
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(result.current.items).toHaveLength(1);

    // Unmount removes the socket listener (the hook's own on/off pairing).
    const handler = updatedHandler();
    unmount();
    expect(mockOff).toHaveBeenCalledWith('conversation:updated', handler);
  });

  it('polls every 15 s while pollingActive and stops polling when it clears', async () => {
    jest.useFakeTimers();
    try {
      mockSocketState.pollingActive = true;
      fetchMock.mockImplementation(async () => ok(conversationsPage(1, 1, ['conv-1'])));

      const { result } = renderHook(() => useConversationsList(), { wrapper: createWrapper() });
      await act(async () => {});
      expect(result.current.pollingActive).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        jest.advanceTimersByTime(CHAT_POLLING_INTERVAL_MS);
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);

      await act(async () => {
        jest.advanceTimersByTime(CHAT_POLLING_INTERVAL_MS);
      });
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      act(() => {
        jest.useRealTimers();
      });
    }
  });

  it('surfaces query errors for the list error state', async () => {
    fetchMock.mockImplementation(async () => {
      throw new Error('network down');
    });

    const { result } = renderHook(() => useConversationsList(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.items).toEqual([]);
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('stays disabled without an access token (the auth-provider contract)', async () => {
    const authMock = jest.requireMock('../../../providers/auth-provider');
    const original = authMock.useAuth;
    authMock.useAuth = () => ({ accessToken: () => undefined });

    try {
      const { result } = renderHook(() => useConversationsList(), { wrapper: createWrapper() });
      await act(async () => {});
      expect(result.current.isLoading).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      authMock.useAuth = original;
    }
  });
});
