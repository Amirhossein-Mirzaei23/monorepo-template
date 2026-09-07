import { act, renderHook } from '@testing-library/react';

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
const mockEmit = jest.fn();

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
    emit: mockEmit,
  }),
}));

import { TYPING_EMIT_INTERVAL_MS, TYPING_INDICATOR_TTL_MS } from '../hooks/use-typing';
import { useTypingEmitter, useTypingIndicator } from '../hooks/use-typing';

/**
 * use-typing hook tests (CHT-006): the composer emit is throttled to one
 * `typing` per 2 s (first keystroke immediate), the indicator appears on the
 * COUNTERPART's typing event, survives re-relays (rolling TTL), fades after
 * the 3 s window, and ignores my own echoes / other conversations.
 */

function fireTyping(payload: unknown): void {
  for (const handler of mockSocketListeners.get('typing') ?? []) {
    handler(payload);
  }
}

beforeEach(() => {
  jest.useFakeTimers();
  mockEmit.mockReset();
  mockSocketListeners.clear();
});

afterEach(() => {
  act(() => {
    jest.useRealTimers();
  });
});

describe('useTypingEmitter (2 s client throttle)', () => {
  it('emits immediately on the first keystroke, then at most once per 2 s', () => {
    const { result } = renderHook(() => useTypingEmitter('conv-1'));

    act(() => {
      result.current();
      result.current();
      result.current();
    });
    expect(mockEmit).toHaveBeenCalledTimes(1);
    expect(mockEmit).toHaveBeenCalledWith('typing', { conversationId: 'conv-1' });

    act(() => {
      jest.advanceTimersByTime(TYPING_EMIT_INTERVAL_MS - 1);
      result.current();
    });
    expect(mockEmit).toHaveBeenCalledTimes(1); // still inside the window

    act(() => {
      jest.advanceTimersByTime(1);
      result.current();
    });
    expect(mockEmit).toHaveBeenCalledTimes(2); // window elapsed → emits again
  });

  it('does not throttle across different conversations (separate hook state)', () => {
    const first = renderHook(() => useTypingEmitter('conv-1'));
    const second = renderHook(() => useTypingEmitter('conv-2'));

    act(() => {
      first.result.current();
      second.result.current();
    });
    expect(mockEmit).toHaveBeenCalledWith('typing', { conversationId: 'conv-1' });
    expect(mockEmit).toHaveBeenCalledWith('typing', { conversationId: 'conv-2' });
    expect(mockEmit).toHaveBeenCalledTimes(2);
  });
});

describe('useTypingIndicator (3 s TTL)', () => {
  it('shows on the counterpart typing and fades after the TTL window', () => {
    const { result } = renderHook(() => useTypingIndicator('conv-1'));
    expect(result.current).toBe(false);

    act(() => {
      fireTyping({ conversationId: 'conv-1', userId: 'user-2' });
    });
    expect(result.current).toBe(true);

    act(() => {
      jest.advanceTimersByTime(TYPING_INDICATOR_TTL_MS - 1);
    });
    expect(result.current).toBe(true);

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current).toBe(false);
  });

  it('keeps the indicator alive across re-relays (rolling TTL)', () => {
    const { result } = renderHook(() => useTypingIndicator('conv-1'));

    act(() => {
      fireTyping({ conversationId: 'conv-1', userId: 'user-2' });
      jest.advanceTimersByTime(TYPING_INDICATOR_TTL_MS - 100);
      fireTyping({ conversationId: 'conv-1', userId: 'user-2' });
      jest.advanceTimersByTime(TYPING_INDICATOR_TTL_MS - 100);
    });
    expect(result.current).toBe(true); // 2s since the FIRST relay — still alive

    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(result.current).toBe(false);
  });

  it('ignores my own typing echoes and other conversations', () => {
    const { result } = renderHook(() => useTypingIndicator('conv-1'));

    act(() => {
      fireTyping({ conversationId: 'conv-1', userId: 'user-1' }); // my own
      fireTyping({ conversationId: 'conv-2', userId: 'user-2' }); // other thread
      jest.advanceTimersByTime(TYPING_INDICATOR_TTL_MS * 2);
    });
    expect(result.current).toBe(false);
  });
});
