import { renderHook } from '@testing-library/react';

// jest.mock's string argument is resolved literally, so the alias fails here
// (same workaround as features/lots and features/media tests).
jest.mock('../../../providers/auth-provider', () => ({
  useAuth: () => ({
    accessToken: () => 'test-access-token',
    user: { id: 'user-1' },
  }),
}));

const mockSocketListeners = new Map<string, Array<(payload: unknown) => void>>();
const mockOn = jest.fn();
const mockOff = jest.fn();

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

import { messageFixture } from '../testing/fixtures';
import { useMarkRead } from '../hooks/use-mark-read';

/**
 * useMarkRead hook tests (CHT-006 read receipts): the thread POSTs /read on
 * mount (opening a thread reads it), re-reads when a COUNTERPART message:new
 * lands while the tab is focused, and stays quiet for my own messages and
 * for incoming messages while the tab is hidden.
 */

const fetchMock = jest.fn();

function ok(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

function fireMessageNew(payload: unknown): void {
  for (const handler of mockSocketListeners.get('message:new') ?? []) {
    handler(payload);
  }
}

function setVisibility(value: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { value, configurable: true });
}

beforeEach(() => {
  fetchMock.mockReset();
  mockSocketListeners.clear();
  fetchMock.mockResolvedValue(ok({ readCount: 0 }));
  global.fetch = fetchMock as unknown as typeof global.fetch;
  setVisibility('visible');
});

afterAll(() => {
  setVisibility('visible');
});

describe('useMarkRead (CHT-006 read receipts)', () => {
  it('marks the thread read on mount', async () => {
    renderHook(() => useMarkRead('conv-1'));

    await Promise.resolve();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/conversations/conv-1/read');
    expect(init.method).toBe('POST');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('re-reads when a counterpart message lands while the tab is focused', async () => {
    renderHook(() => useMarkRead('conv-1'));
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireMessageNew({
      conversationId: 'conv-1',
      message: messageFixture({ id: 'm-2', senderId: 'user-2' }),
    });
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('ignores my own messages, other conversations, and unfocused tabs', async () => {
    renderHook(() => useMarkRead('conv-1'));
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // My own echo.
    fireMessageNew({
      conversationId: 'conv-1',
      message: messageFixture({ id: 'm-2', senderId: 'user-1' }),
    });
    // Another conversation.
    fireMessageNew({
      conversationId: 'conv-other',
      message: messageFixture({ id: 'm-3', senderId: 'user-2' }),
    });
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Counterpart message while the tab is HIDDEN — no read.
    setVisibility('hidden');
    fireMessageNew({
      conversationId: 'conv-1',
      message: messageFixture({ id: 'm-4', senderId: 'user-2' }),
    });
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('swallows read failures (fire-and-forget; the next trigger retries)', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    renderHook(() => useMarkRead('conv-1'));

    await new Promise((resolve) => setTimeout(resolve, 0));
    // No unhandled rejection / crash — the hook swallowed it.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
