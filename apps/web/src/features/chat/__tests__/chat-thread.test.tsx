import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { io } from 'socket.io-client';

// jest.mock's string argument is resolved literally, so the alias fails here
// (same workaround as features/lots and features/media tests). The context
// value is a STABLE module object — mirroring AuthProvider's memoized value,
// whose identity the use-chat-socket effect depends on (a fresh object per
// render would cancel the 10 s fallback timer on every rerender).
const mockAuth = {
  status: 'authenticated' as const,
  accessToken: () => 'test-access-token',
  user: { id: 'user-1' },
};
jest.mock('../../../providers/auth-provider', () => ({
  useAuth: () => mockAuth,
}));
jest.mock('socket.io-client', () => ({ io: jest.fn() }));

import { ChatThread } from '../components/chat-thread';
import { CHAT_FALLBACK_AFTER_MS } from '../hooks/use-chat-socket';
import { resetChatSocketForTests } from '../lib/socket';
import { conversationItemFixture, messageFixture, messagePageFixture } from '../testing/fixtures';

/**
 * ChatThread integration tests (CHT-006) — the REAL feature hooks run against
 * a mocked BFF (global.fetch) and a scripted socket fake: the lot-context
 * header fields + «مشاهده لات» link, bubble sides/system pill/day separators/
 * read ticks, the optimistic send through the composer (temp bubble →
 * reconcile), the room subscribe lifecycle, and the 15 s polling fallback
 * badge after a >10 s disconnect (CHT-004 contract).
 */

const ioMock = io as jest.Mock;

interface FakeSocket {
  connected: boolean;
  connect: jest.Mock;
  disconnect: jest.Mock;
  on: jest.Mock;
  off: jest.Mock;
  emit: jest.Mock;
  trigger: (event: 'connect' | 'disconnect') => void;
}

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
      const stack = (listeners.get(event) ?? []).filter((item) => item !== handler);
      listeners.set(event, stack);
    }),
    emit: jest.fn(),
    trigger: (event) => fire(event),
  };
  return socket;
}

const fetchMock = jest.fn();

const THREAD = [
  messageFixture({
    id: 'm-sys',
    senderId: null,
    type: 'SYSTEM',
    body: 'گفتگو درباره: عمده پیراهن مردانه — ۲٬۲۵۰٬۰۰۰ تومان',
    createdAt: '2026-09-04T09:00:00.000Z',
  }),
  messageFixture({ id: 'm-theirs', senderId: 'user-2', createdAt: '2026-09-04T09:31:00.000Z' }),
  messageFixture({
    id: 'm-mine-unread',
    senderId: 'user-1',
    body: 'قیمت نهایی چقدر می‌شود؟',
    createdAt: '2026-09-05T14:05:00.000Z',
    readAt: null,
  }),
  messageFixture({
    id: 'm-mine-read',
    senderId: 'user-1',
    body: 'باشه',
    createdAt: '2026-09-05T14:06:00.000Z',
    readAt: '2026-09-05T14:07:00.000Z',
  }),
];

function ok(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

let releaseSend: (() => void) | undefined;

function routeFetch(input: unknown, init?: RequestInit): Promise<Response> {
  const url = String(input);
  const method = String(init?.method ?? 'GET').toUpperCase();
  if (url.includes('/read')) {
    return Promise.resolve(ok({ readCount: 0 }));
  }
  if (url.includes('/messages')) {
    if (method === 'POST') {
      return new Promise((resolve) => {
        releaseSend = () =>
          resolve(
            ok(
              messageFixture({
                id: 'm-new',
                senderId: 'user-1',
                body: 'قیمت چقدر می‌شود؟',
              }),
              201,
            ),
          );
      });
    }
    return Promise.resolve(ok(messagePageFixture(THREAD)));
  }
  if (url.startsWith('/api/conversations?')) {
    return Promise.resolve(
      ok({ items: [conversationItemFixture()], total: 1, page: 1, limit: 50 }),
    );
  }
  return Promise.reject(new Error(`unexpected fetch: ${url}`));
}

function renderThread() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<ChatThread conversationId="conv-1" />, {
    wrapper: function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    },
  });
  return { ...view, queryClient };
}

beforeEach(() => {
  jest.useRealTimers();
  resetChatSocketForTests();
  ioMock.mockReset();
  const socket = createFakeSocket();
  ioMock.mockReturnValue(socket);
  fetchMock.mockReset();
  fetchMock.mockImplementation(routeFetch);
  releaseSend = undefined;
  global.fetch = fetchMock as unknown as typeof global.fetch;
});

describe('ChatThread (CHT-006 integration)', () => {
  it('renders the lot-context header with the «مشاهده لات» link to /l/{code}', async () => {
    renderThread();

    expect(await screen.findByText('عمده پیراهن مردانه — ۵۰ عدد')).toBeInTheDocument();
    expect(screen.getByText('۲٬۲۵۰٬۰۰۰ تومان')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /مشاهده لات/ });
    expect(link).toHaveAttribute('href', '/l/7Kd2Qm9x');
  });

  it('renders bubbles on their sides, the system pill, day separators and the read ticks', async () => {
    const { container } = renderThread();

    expect(await screen.findByText('سلام، موجود است؟')).toBeInTheDocument();

    // Own vs counterpart alignment (RTL logical classes).
    expect(screen.getByText('قیمت نهایی چقدر می‌شود؟').parentElement?.parentElement).toHaveClass(
      'justify-end',
    );
    expect(screen.getByText('سلام، موجود است؟').parentElement?.parentElement).toHaveClass(
      'justify-start',
    );

    // SYSTEM welcome as a centered gray pill.
    const pill = screen.getByText(/گفتگو درباره:/);
    expect(pill).toHaveClass('rounded-full');
    expect(pill).toHaveClass('bg-zinc-100');

    // One Jalali day separator per day (Sep 4 + Sep 5).
    const daySeparators = container.querySelectorAll('.rounded-full.bg-zinc-100');
    const separatorLabels = Array.from(daySeparators)
      .map((node) => node.textContent)
      .filter((text) => text?.includes('/'));
    expect(new Set(separatorLabels).size).toBe(2);

    // Ticks: ✓ on the unread own bubble, ✓✓ on the read one.
    expect(screen.getByRole('img', { name: 'ارسال شد' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'خوانده شد' })).toBeInTheDocument();
  });

  it('sends optimistically through the composer: temp bubble → POST → reconciled row', async () => {
    const user = userEvent.setup();
    renderThread();

    await screen.findByText('سلام، موجود است؟');
    await user.type(screen.getByRole('textbox', { name: 'متن پیام' }), 'قیمت چقدر می‌شود؟');
    await user.click(screen.getByRole('button', { name: 'ارسال' }));

    // The optimistic bubble appears instantly while the POST is in flight.
    expect(screen.getByText('قیمت چقدر می‌شود؟')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'در حال ارسال' })).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls.find(
      ([callInput, callInit]) =>
        String(callInput).includes('/messages') &&
        String(callInit?.method ?? '').toUpperCase() === 'POST',
    ) as unknown as [string, RequestInit];
    expect(url).toBe('/api/conversations/conv-1/messages');
    expect(JSON.parse(String(init.body))).toEqual({ body: 'قیمت چقدر می‌شود؟' });

    // The server ack retires the temp (the reconciled row keeps showing it).
    await act(async () => {
      releaseSend?.();
    });
    await waitFor(() =>
      expect(screen.queryByRole('img', { name: 'در حال ارسال' })).not.toBeInTheDocument(),
    );
    expect(screen.getByText('قیمت چقدر می‌شود؟')).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: 'ارسال شد' })).toHaveLength(2);
  });

  it('subscribes to the conversation room on mount and unsubscribes on unmount', async () => {
    const { unmount } = renderThread();
    await screen.findByText('سلام، موجود است؟');

    const socket = ioMock.mock.results[0]?.value as FakeSocket;
    expect(socket.emit).toHaveBeenCalledWith('conversation:subscribe', {
      conversationId: 'conv-1',
    });

    unmount();
    expect(socket.emit).toHaveBeenCalledWith('conversation:unsubscribe', {
      conversationId: 'conv-1',
    });
  });

  it('shows the polling-fallback badge after the socket stays down beyond 10 s', async () => {
    jest.useFakeTimers();
    const view = renderThread();
    await screen.findByText('سلام، موجود است؟');
    expect(screen.queryByText(/اتصال زنده قطع است/)).not.toBeInTheDocument();

    const socket = ioMock.mock.results[0]?.value as FakeSocket;
    act(() => {
      socket.trigger('disconnect');
      jest.advanceTimersByTime(CHAT_FALLBACK_AFTER_MS + 1);
    });

    expect(screen.getByText(/اتصال زنده قطع است/)).toBeInTheDocument();

    act(() => {
      socket.trigger('connect');
    });
    expect(screen.queryByText(/اتصال زنده قطع است/)).not.toBeInTheDocument();
    view.unmount();
  });
});
