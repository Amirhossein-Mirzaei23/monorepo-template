import { messageFixture, messagePageFixture } from '../testing/fixtures';
import {
  CONVERSATIONS_CONTEXT_SCAN_LIMIT,
  MESSAGES_PAGE_SIZE,
  fetchMessages,
  markConversationRead,
  sendMessage,
} from '../api/chat-api';

/**
 * CHT-006 fetcher tests — the BFF call SHAPES for the CHT-003 endpoints:
 * backwards-cursor query params, the send body, and the zod parse boundary
 * (contract drift fails loudly). Component/hook behavior lives in the other
 * suites; here only transport + validation.
 */

const fetchMock = jest.fn();

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

describe('chat-api CHT-003 fetchers', () => {
  it('GETs the newest messages page with the default limit and no cursor', async () => {
    fetchMock.mockResolvedValue(ok(messagePageFixture([messageFixture()])));

    const page = await fetchMessages('tok', 'conv-1');

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      `/api/conversations/conv-1/messages?limit=${MESSAGES_PAGE_SIZE}`,
    );
    expect(page.items).toHaveLength(1);
    expect(page.hasMore).toBe(false);
  });

  it('passes the `before` cursor for older history pages', async () => {
    fetchMock.mockResolvedValue(ok(messagePageFixture([messageFixture()], true, 'm-0')));

    const page = await fetchMessages('tok', 'conv-1', 'm-5');

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      `/api/conversations/conv-1/messages?limit=${MESSAGES_PAGE_SIZE}&before=m-5`,
    );
    expect(page.nextCursor).toBe('m-0');
  });

  it('POSTs the trimmed send body as TEXT and parses the created row', async () => {
    fetchMock.mockResolvedValue(ok(messageFixture({ id: 'm-new' }), 201));

    const created = await sendMessage('tok', 'conv-1', 'قیمت چقدر می‌شود؟');

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/conversations/conv-1/messages');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ body: 'قیمت چقدر می‌شود؟' });
    expect(created.id).toBe('m-new');
  });

  it('POSTs the read receipt and parses { readCount }', async () => {
    fetchMock.mockResolvedValue(ok({ readCount: 4 }));

    const result = await markConversationRead('tok', 'conv-1');

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/conversations/conv-1/read');
    expect(init.method).toBe('POST');
    expect(result).toEqual({ readCount: 4 });
  });

  it('rejects contract-drifted payloads at the parse boundary', async () => {
    fetchMock.mockResolvedValue(ok({ items: 'not-an-array', hasMore: 'no' }));

    await expect(fetchMessages('tok', 'conv-1')).rejects.toThrow(/Invalid messages payload/);
  });

  it('requires an access token before any call', async () => {
    await expect(fetchMessages(undefined, 'conv-1')).rejects.toThrow('Not authenticated');
    await expect(sendMessage(undefined, 'conv-1', 'سلام')).rejects.toThrow('Not authenticated');
    await expect(markConversationRead(undefined, 'conv-1')).rejects.toThrow('Not authenticated');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(CONVERSATIONS_CONTEXT_SCAN_LIMIT).toBe(50); // API hard cap
  });
});
