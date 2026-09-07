import { act, renderHook } from '@testing-library/react';
import { io } from 'socket.io-client';
import { useAuth } from '@/providers/auth-provider';
import { resetChatSocketForTests } from '../lib/socket';
import { CHAT_FALLBACK_AFTER_MS, useChatSocket } from '../hooks/use-chat-socket';

/**
 * CHT-004 hook tests — socket.io-client is replaced with a scripted fake so
 * the suite pins the HOOK's contract: connect on auth, the >10s-disconnect
 * polling-fallback flag (fake timers), reconnect on token change, logout
 * teardown, and the on/off/emit passthrough. The real lib/socket singleton
 * runs underneath (only `io` is mocked), so its caching is covered too.
 */

// jest.mock's string argument is resolved literally — the @/ alias fails there
// (same workaround as features/lots and features/media tests).
jest.mock('../../../providers/auth-provider', () => ({ useAuth: jest.fn() }));
jest.mock('socket.io-client', () => ({ io: jest.fn() }));

const ioMock = io as jest.Mock;
const useAuthMock = useAuth as jest.Mock;

interface FakeSocket {
  connected: boolean;
  connect: jest.Mock;
  disconnect: jest.Mock;
  on: jest.Mock;
  off: jest.Mock;
  emit: jest.Mock;
  trigger: (event: 'connect' | 'disconnect') => void;
}

/** Scripted socket double: records on/off/connect/disconnect and lets tests
 * fire the two lifecycle events the hook reacts to. */
function createFakeSocket(): FakeSocket {
  const listeners = new Map<string, Array<() => void>>();
  const fire = (event: string) => {
    for (const handler of listeners.get(event) ?? []) {
      handler();
    }
  };
  const socket: FakeSocket = {
    connected: false,
    connect: jest.fn(() => {
      socket.connected = true;
      fire('connect');
    }),
    disconnect: jest.fn(() => {
      const wasConnected = socket.connected;
      socket.connected = false;
      if (wasConnected) {
        fire('disconnect');
      }
    }),
    on: jest.fn((event: string, handler: () => void) => {
      const stack = listeners.get(event) ?? [];
      stack.push(handler);
      listeners.set(event, stack);
    }),
    off: jest.fn((event: string, handler: () => void) => {
      const stack = listeners.get(event) ?? [];
      const index = stack.indexOf(handler);
      if (index >= 0) {
        stack.splice(index, 1);
      }
    }),
    emit: jest.fn(),
    trigger: (event) => fire(event),
  };
  return socket;
}

/** Drives the mocked useAuth; each setup yields a fresh token getter identity
 * exactly like AuthProvider's memo does around login/logout/refresh. */
function authSetup(status: 'loading' | 'authenticated' | 'unauthenticated', token?: string) {
  useAuthMock.mockReturnValue({ status, accessToken: () => token });
}

beforeEach(() => {
  jest.useFakeTimers();
  resetChatSocketForTests();
  useAuthMock.mockReset();
});

afterEach(() => {
  act(() => {
    jest.useRealTimers();
  });
});

test('connects exactly once while authenticated (singleton `io` call with the /ws path)', () => {
  authSetup('authenticated', 'tok-1');
  const socket = createFakeSocket();
  ioMock.mockReturnValue(socket);

  const { result } = renderHook(() => useChatSocket());

  expect(ioMock).toHaveBeenCalledTimes(1);
  const [origin, options] = ioMock.mock.calls[0] ?? [];
  expect(origin).toBe(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001');
  expect(options).toMatchObject({ path: '/ws', autoConnect: false, reconnection: true });
  expect(socket.connect).toHaveBeenCalledTimes(1);
  expect(result.current.connected).toBe(true); // the fake fires `connect` inside connect()
  expect(result.current.pollingActive).toBe(false);
});

test('auth callback reads the CURRENT in-memory token at connect time', () => {
  authSetup('authenticated', 'tok-1');
  const socket = createFakeSocket();
  ioMock.mockReturnValue(socket);

  renderHook(() => useChatSocket());

  expect(typeof options()?.auth).toBe('function');
  const seen: Array<Record<string, unknown>> = [];
  options()?.auth?.((payload: Record<string, unknown>) => seen.push(payload));
  expect(seen).toEqual([{ token: 'tok-1' }]);
});

test('does not connect while the session is restoring (loading)', () => {
  authSetup('loading');
  const socket = createFakeSocket();
  ioMock.mockReturnValue(socket);

  renderHook(() => useChatSocket());

  expect(socket.connect).not.toHaveBeenCalled();
});

test('arms the 10s polling fallback when the socket stays disconnected, clears it on reconnect', () => {
  authSetup('authenticated', 'tok-1');
  const socket = createFakeSocket();
  ioMock.mockReturnValue(socket);
  const { result } = renderHook(() => useChatSocket());

  // Server drops the connection.
  act(() => {
    socket.trigger('disconnect');
  });
  expect(result.current.connected).toBe(false);
  expect(result.current.pollingActive).toBe(false);

  act(() => {
    jest.advanceTimersByTime(CHAT_FALLBACK_AFTER_MS - 1);
  });
  expect(result.current.pollingActive).toBe(false); // not yet 10s

  act(() => {
    jest.advanceTimersByTime(1);
  });
  expect(result.current.pollingActive).toBe(true); // >10s disconnected → poll

  // Reconnect: consumers must flip back to realtime immediately.
  act(() => {
    socket.trigger('connect');
  });
  expect(result.current.connected).toBe(true);
  expect(result.current.pollingActive).toBe(false);
});

test('reconnects with a fresh handshake when the token changes', () => {
  authSetup('authenticated', 'tok-1');
  const socket = createFakeSocket();
  ioMock.mockReturnValue(socket);
  const { rerender } = renderHook(() => useChatSocket());

  authSetup('authenticated', 'tok-2');
  rerender();

  expect(socket.disconnect).toHaveBeenCalledTimes(1); // drop the old-token dial
  expect(socket.connect).toHaveBeenCalledTimes(2);
});

test('tears the connection down on logout and never arms the fallback', () => {
  authSetup('authenticated', 'tok-1');
  const socket = createFakeSocket();
  ioMock.mockReturnValue(socket);
  const { result, rerender } = renderHook(() => useChatSocket());
  expect(result.current.connected).toBe(true);

  authSetup('unauthenticated');
  rerender();

  expect(socket.disconnect).toHaveBeenCalled();
  expect(result.current.connected).toBe(false);

  act(() => {
    jest.advanceTimersByTime(CHAT_FALLBACK_AFTER_MS * 5);
  });
  expect(result.current.pollingActive).toBe(false); // logout ≠ polling mode
});

test('on/off/emit are a typed passthrough onto the singleton socket', () => {
  authSetup('authenticated', 'tok-1');
  const socket = createFakeSocket();
  ioMock.mockReturnValue(socket);
  const { result } = renderHook(() => useChatSocket());

  const handler = jest.fn();
  act(() => {
    result.current.on('message:new', handler);
    result.current.emit('conversation:subscribe', { conversationId: 'conv-1' });
    result.current.emit('typing', { conversationId: 'conv-1' });
  });

  expect(socket.on).toHaveBeenCalledWith('message:new', handler);
  expect(socket.emit).toHaveBeenNthCalledWith(1, 'conversation:subscribe', {
    conversationId: 'conv-1',
  });
  expect(socket.emit).toHaveBeenNthCalledWith(2, 'typing', { conversationId: 'conv-1' });

  act(() => {
    result.current.off('message:new', handler);
  });
  expect(socket.off).toHaveBeenCalledWith('message:new', handler);
});

test('unmount removes this consumer’s listeners; the singleton socket stays alive', () => {
  authSetup('authenticated', 'tok-1');
  const socket = createFakeSocket();
  ioMock.mockReturnValue(socket);
  const { unmount } = renderHook(() => useChatSocket());

  const connectHandlers = socket.on.mock.calls.filter(([event]) => event === 'connect');
  const disconnectHandlers = socket.on.mock.calls.filter(([event]) => event === 'disconnect');
  expect(connectHandlers).toHaveLength(1);
  expect(disconnectHandlers).toHaveLength(1);

  unmount();

  expect(socket.off).toHaveBeenCalledWith('connect', connectHandlers[0]?.[1]);
  expect(socket.off).toHaveBeenCalledWith('disconnect', disconnectHandlers[0]?.[1]);
  // The singleton is NOT disconnected on unmount — it lives for the session.
  expect(socket.disconnect).not.toHaveBeenCalled();

  // A late server event after unmount finds no listener to crash.
  expect(() => socket.trigger('connect')).not.toThrow();
});

// --- helpers ---

interface AuthOptions {
  auth?: (callback: (payload: Record<string, unknown>) => void) => void;
  path?: string;
}

function options(): AuthOptions | undefined {
  return ioMock.mock.calls[0]?.[1] as AuthOptions | undefined;
}
