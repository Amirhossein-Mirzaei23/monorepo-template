import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

// jest.mock's string argument is resolved literally, so the alias fails here
// (same workaround as features/lots and features/media tests).
jest.mock('../../../providers/auth-provider', () => ({
  useAuth: () => ({
    accessToken: () => 'test-access-token',
    user: { id: 'user-1' },
  }),
}));

const mockOn = jest.fn();
const mockOff = jest.fn();

const mockSocketListeners = new Map<string, Array<(payload: unknown) => void>>();

jest.mock('../hooks/use-chat-socket', () => ({
  useChatSocket: () => ({
    connected: true,
    pollingActive: false,
    on: mockOn.mockImplementation((event: string, handler: (payload: unknown) => void) => {
      const stack = mockSocketListeners.get(event) ?? [];
      stack.push(handler);
      mockSocketListeners.set(event, stack);
    }),
    off: mockOff.mockImplementation((event: string, handler: (payload: unknown) => void) => {
      const stack = (mockSocketListeners.get(event) ?? []).filter((item) => item !== handler);
      mockSocketListeners.set(event, stack);
    }),
    emit: jest.fn(),
  }),
}));

import { messageFixture, messagePageFixture } from '../testing/fixtures';
import { useMessages } from '../hooks/use-messages';

/**
 * useMessages hook tests (CHT-006): the backwards-cursor infinite walk over
 * the CHT-003 envelope (fetchPreviousPage PREPENDS older history), the
 * `message:new` append with id-dedupe (the WS echo + POST ack reconcile onto
 * one row), and the `message:read` tick flip (counterpart reads stamp MY
 * messages; my own read does not).
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

function fire(event: string, payload: unknown): void {
  for (const handler of mockSocketListeners.get(event) ?? []) {
    handler(payload);
  }
}

beforeEach(() => {
  fetchMock.mockReset();
  mockOn.mockReset();
  mockOff.mockReset();
  mockSocketListeners.clear();
  global.fetch = fetchMock as unknown as typeof global.fetch;
});

describe('useMessages (CHT-006 thread query)', () => {
  it('fetches the newest page and flattens ASC', async () => {
    fetchMock.mockResolvedValue(
      ok(messagePageFixture([messageFixture({ id: 'm-1' }), messageFixture({ id: 'm-2' })])),
    );

    const { result } = renderHook(() => useMessages('conv-1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.messages).toHaveLength(2));

    expect(result.current.messages.map((message) => message.id)).toEqual(['m-1', 'm-2']);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      '/api/conversations/conv-1/messages?limit=30',
    );
    expect(result.current.hasPreviousPage).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it('walks OLDER history on fetchPreviousPage and prepends without jumps in ordering', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.includes('before=')) {
        return ok(messagePageFixture([messageFixture({ id: 'm-old' })], false, null));
      }
      return ok(
        messagePageFixture(
          [messageFixture({ id: 'm-1' }), messageFixture({ id: 'm-2' })],
          true,
          'm-1',
        ),
      );
    });

    const { result } = renderHook(() => useMessages('conv-1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    expect(result.current.hasPreviousPage).toBe(true);

    await act(async () => {
      result.current.fetchPreviousPage();
    });
    await waitFor(() => expect(result.current.messages).toHaveLength(3));

    // Oldest → newest overall; the older page was PREPENDED.
    expect(result.current.messages.map((message) => message.id)).toEqual(['m-old', 'm-1', 'm-2']);
    expect(result.current.hasPreviousPage).toBe(false);
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      '/api/conversations/conv-1/messages?limit=30&before=m-1',
    );
  });

  it('appends message:new events and dedupes by id (WS echo + POST ack = one row)', async () => {
    fetchMock.mockResolvedValue(ok(messagePageFixture([messageFixture({ id: 'm-1' })])));

    const { result } = renderHook(() => useMessages('conv-1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.messages).toHaveLength(1));

    const echo = messageFixture({ id: 'm-2', senderId: 'user-1', body: 'چرا' });
    await act(async () => {
      fire('message:new', { conversationId: 'conv-1', message: echo });
    });
    await waitFor(() => expect(result.current.messages).toHaveLength(2));

    // The same row delivered twice (echo + POST ack) stays ONE row.
    await act(async () => {
      fire('message:new', { conversationId: 'conv-1', message: echo });
    });
    expect(result.current.messages).toHaveLength(2);

    // Other conversations are ignored.
    await act(async () => {
      fire('message:new', {
        conversationId: 'conv-other',
        message: messageFixture({ id: 'm-99' }),
      });
    });
    expect(result.current.messages).toHaveLength(2);
  });

  it('flips my ticks on the counterpart message:read and ignores my own read events', async () => {
    fetchMock.mockResolvedValue(
      ok(
        messagePageFixture([
          messageFixture({ id: 'm-mine', senderId: 'user-1', body: 'از من', readAt: null }),
          messageFixture({ id: 'm-theirs', senderId: 'user-2', readAt: null }),
        ]),
      ),
    );

    const { result } = renderHook(() => useMessages('conv-1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.messages).toHaveLength(2));

    await act(async () => {
      fire('message:read', { conversationId: 'conv-1', readerId: 'user-2', readCount: 1 });
    });
    await waitFor(() =>
      expect(
        result.current.messages.find((message) => message.id === 'm-mine')?.readAt,
      ).not.toBeNull(),
    );
    // The counterpart's OWN messages keep their read state untouched.
    expect(result.current.messages.find((message) => message.id === 'm-theirs')?.readAt).toBeNull();

    // My own read event (I read another device) must not flip my ticks.
    const before = result.current.messages.find((message) => message.id === 'm-mine')?.readAt;
    await act(async () => {
      fire('message:read', { conversationId: 'conv-1', readerId: 'user-1', readCount: 0 });
    });
    expect(result.current.messages.find((message) => message.id === 'm-mine')?.readAt).toBe(before);
  });
});
