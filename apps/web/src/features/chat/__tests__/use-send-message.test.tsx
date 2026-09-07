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

// useSendMessage reconciles into the useMessages cache through the shared
// helpers — the query itself stays cold; only the key data matters here.
import { messageFixture } from '../testing/fixtures';
import { chatKeys } from '../api/keys';
import { MESSAGE_BODY_MAX_LENGTH } from '../api/chat-api';
import { useSendMessage } from '../hooks/use-send-message';

/**
 * useSendMessage hook tests (CHT-006 optimistic send): the temp bubble with a
 * NEGATIVE id appears instantly, the POST carries the trimmed TEXT body,
 * reconcile happens on BOTH ack paths (POST response and the message:new WS
 * echo — whichever arrives first) without duplicated rows, failures flag the
 * temp for retry, and empty/oversize bodies never hit the wire.
 */

const fetchMock = jest.fn();

let letResolve: (() => void) | undefined;

function deferredOk(body: unknown, status = 201): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    queryClient,
    Wrapper: function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    },
  };
}

/**
 * Seeds the thread cache the way the loaded useMessages query would hold it —
 * the composer is disabled until history loads, so sends always reconcile
 * into a populated cache (appendServerMessage skips a cold one by design).
 */
function seedLoadedThread(queryClient: QueryClient) {
  queryClient.setQueryData(chatKeys.messages('conv-1'), {
    pages: [{ items: [], hasMore: false, nextCursor: null }],
    pageParams: [undefined],
  });
}

function fireMessageNew(payload: unknown): void {
  for (const handler of mockSocketListeners.get('message:new') ?? []) {
    handler(payload);
  }
}

beforeEach(() => {
  fetchMock.mockReset();
  mockSocketListeners.clear();
  letResolve = undefined;
  global.fetch = fetchMock as unknown as typeof global.fetch;
});

describe('useSendMessage (CHT-006 optimistic send)', () => {
  it('adds a negative-id sending temp instantly and POSTs the trimmed body', async () => {
    const { Wrapper } = createWrapper();
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          letResolve = () => resolve(deferredOk(messageFixture({ id: 'm-2', senderId: 'user-1' })));
        }),
    );

    const { result } = renderHook(() => useSendMessage('conv-1'), { wrapper: Wrapper });

    act(() => {
      result.current.send('  سلام  ');
    });

    expect(result.current.pending).toHaveLength(1);
    const temp = result.current.pending[0];
    expect(temp?.tempId).toBeLessThan(0);
    expect(temp?.status).toBe('sending');
    expect(temp?.body).toBe('سلام');
    expect(temp?.senderId).toBe('user-1');

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/conversations/conv-1/messages');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ body: 'سلام' });
  });

  it('reconciles on the POST response: temp retires and the server row lands in the cache', async () => {
    const { queryClient, Wrapper } = createWrapper();
    seedLoadedThread(queryClient);
    fetchMock.mockResolvedValue(
      deferredOk(messageFixture({ id: 'm-2', senderId: 'user-1', body: 'سلام' })),
    );

    const { result } = renderHook(() => useSendMessage('conv-1'), { wrapper: Wrapper });
    act(() => {
      result.current.send('سلام');
    });
    await waitFor(() => expect(result.current.pending).toHaveLength(0));

    const cached = queryClient.getQueryData<{ pages: Array<{ items: Array<{ id: string }> }> }>(
      chatKeys.messages('conv-1'),
    );
    expect(cached?.pages.flatMap((page) => page.items).map((item) => item.id)).toEqual(['m-2']);
  });

  it('reconciles on the WS echo first; the later POST response does not duplicate', async () => {
    const { queryClient, Wrapper } = createWrapper();
    seedLoadedThread(queryClient);
    const serverRow = messageFixture({ id: 'm-2', senderId: 'user-1', body: 'سلام' });
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          letResolve = () => resolve(deferredOk(serverRow));
        }),
    );

    const { result } = renderHook(() => useSendMessage('conv-1'), { wrapper: Wrapper });
    act(() => {
      result.current.send('سلام');
    });
    expect(result.current.pending).toHaveLength(1);

    // The echo beats the POST response.
    act(() => {
      fireMessageNew({ conversationId: 'conv-1', message: serverRow });
    });
    await waitFor(() => expect(result.current.pending).toHaveLength(0));
    const afterEcho = queryClient.getQueryData<{ pages: Array<{ items: Array<{ id: string }> }> }>(
      chatKeys.messages('conv-1'),
    );
    expect(afterEcho?.pages.flatMap((page) => page.items)).toHaveLength(1);

    // The POST response lands afterwards — id-dedupe keeps a single row.
    await act(async () => {
      letResolve?.();
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const afterAck = queryClient.getQueryData<{ pages: Array<{ items: Array<{ id: string }> }> }>(
      chatKeys.messages('conv-1'),
    );
    expect(afterAck?.pages.flatMap((page) => page.items)).toHaveLength(1);
    expect(result.current.pending).toHaveLength(0);
  });

  it('flags a failed send for retry; retry re-POSTs the same body and reconciles', async () => {
    const { queryClient, Wrapper } = createWrapper();
    seedLoadedThread(queryClient);
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    const { result } = renderHook(() => useSendMessage('conv-1'), { wrapper: Wrapper });
    act(() => {
      result.current.send('سلام');
    });
    await waitFor(() => expect(result.current.pending[0]?.status).toBe('failed'));

    // Network back: retry sends the SAME body and reconciles.
    fetchMock.mockResolvedValueOnce(
      deferredOk(messageFixture({ id: 'm-2', senderId: 'user-1', body: 'سلام' })),
    );
    const tempId = result.current.pending[0]?.tempId;
    act(() => {
      if (tempId !== undefined) {
        result.current.retry(tempId);
      }
    });
    expect(result.current.pending[0]?.status).toBe('sending');
    await waitFor(() => expect(result.current.pending).toHaveLength(0));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const cached = queryClient.getQueryData<{ pages: Array<{ items: Array<{ id: string }> }> }>(
      chatKeys.messages('conv-1'),
    );
    expect(cached?.pages.flatMap((page) => page.items).map((item) => item.id)).toEqual(['m-2']);
  });

  it('never hits the wire for empty, whitespace-only or oversize bodies', async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useSendMessage('conv-1'), { wrapper: Wrapper });

    act(() => {
      result.current.send('');
      result.current.send('    ');
      result.current.send('x'.repeat(MESSAGE_BODY_MAX_LENGTH + 1));
    });

    expect(result.current.pending).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();

    // The boundary value itself passes the gate.
    fetchMock.mockResolvedValue(deferredOk(messageFixture({ id: 'm-max', senderId: 'user-1' })));
    act(() => {
      result.current.send('x'.repeat(MESSAGE_BODY_MAX_LENGTH));
    });
    await waitFor(() => expect(result.current.pending).toHaveLength(0));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
