import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';

// jest.mock's string argument is resolved literally, so the alias fails here
// (same workaround as features/lots and features/media tests).
jest.mock('../../../providers/auth-provider', () => ({
  useAuth: () => ({ accessToken: () => 'test-access-token' }),
}));

const mockSocketState = { pollingActive: false };

jest.mock('../hooks/use-chat-socket', () => ({
  useChatSocket: () => ({
    connected: !mockSocketState.pollingActive,
    pollingActive: mockSocketState.pollingActive,
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
  }),
}));

import { ChatInbox } from '../components/chat-inbox';
import { conversationItemFixture } from '../testing/fixtures';

/**
 * CHT-005 component tests: the inbox row fields (lot context, counterpart,
 * preview, unread badge, relative time, link target), the system-preview
 * style, the lot status chip, the empty/error/skeleton states, the fallback
 * badge and pagination — exercised through the mocked BFF (global.fetch),
 * like the my-lots suite.
 */

const fetchMock = jest.fn();

/** jsdom has no IntersectionObserver — a recording stub like lot-list's, so
 * the sentinel effect can mount (the «بیشتر» button drives pagination here). */
class MockIntersectionObserver {
  readonly observe = jest.fn();
  readonly disconnect = jest.fn();
  readonly unobserve = jest.fn();
}

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

function inboxPage(
  items: ReturnType<typeof conversationItemFixture>[],
  page = 1,
  total = items.length,
) {
  return { items, total, page, limit: 20 };
}

function renderInbox() {
  return render(<ChatInbox />, { wrapper: createWrapper() });
}

beforeEach(() => {
  fetchMock.mockReset();
  mockSocketState.pollingActive = false;
  global.fetch = fetchMock as unknown as typeof global.fetch;
  global.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;
  fetchMock.mockImplementation(async () => ok(inboxPage([conversationItemFixture()])));
});

describe('ChatInbox rows (CHT-005 lot-context cards)', () => {
  it('renders the row fields and links the whole card to /chat/{id}', async () => {
    renderInbox();

    const row = await screen.findByRole('link', { name: /عمده پیراهن مردانه/ });
    expect(row).toHaveAttribute('href', '/chat/conv-1');
    expect(row).toHaveTextContent('عمده پیراهن مردانه — ۵۰ عدد'); // lot title
    expect(row).toHaveTextContent('مینا رضایی'); // counterpart
    expect(row).toHaveTextContent('۲٬۲۵۰٬۰۰۰ تومان'); // price via formatToman
    expect(row).toHaveTextContent('سلام، موجودی همین رنگ هم دارید؟'); // preview
    expect(row).toHaveTextContent('فعال'); // lot status chip (fa label)
    // Lot cover thumb renders as an image.
    expect(row.querySelector('img')).toHaveAttribute(
      'src',
      'http://localhost:3001/media/2026/09/asset-1t.webp',
    );
  });

  it('shows the unread badge with fa digits and hides it at zero', async () => {
    fetchMock.mockImplementation(async () =>
      ok(
        inboxPage([
          conversationItemFixture({
            id: 'conv-unread',
            myUnreadCount: 3,
            lot: { ...conversationItemFixture().lot, title: 'عمده کفش ورزشی — ۳۰ جفت' },
          }),
          conversationItemFixture({ id: 'conv-read', myUnreadCount: 0 }),
        ]),
      ),
    );
    renderInbox();

    const unreadRow = await screen.findByRole('link', { name: /عمده کفش ورزشی/ });
    expect(unreadRow).toHaveAttribute('href', '/chat/conv-unread');
    const badge = within(unreadRow).getByLabelText('۳ پیام خوانده‌نشده');
    expect(badge).toHaveTextContent('۳'); // formatFaDigits

    const readRow = screen.getByRole('link', { name: /عمده پیراهن مردانه/ });
    expect(readRow).toHaveAttribute('href', '/chat/conv-read');
    expect(within(readRow).queryByLabelText(/پیام خوانده‌نشده/)).not.toBeInTheDocument();
  });

  it('renders the system preview in the gray italic style and normal previews without it', async () => {
    fetchMock.mockImplementation(async () =>
      ok(
        inboxPage([
          conversationItemFixture({
            id: 'conv-system',
            isLastMessageSystem: true,
            lastMessagePreview: 'گفتگو درباره: عمده پیراهن مردانه — ۲٬۲۵۰٬۰۰۰ تومان',
          }),
          conversationItemFixture({ id: 'conv-text' }),
        ]),
      ),
    );
    renderInbox();

    await screen.findByText('گفتگو درباره: عمده پیراهن مردانه — ۲٬۲۵۰٬۰۰۰ تومان');
    const systemPreview = screen.getByText('گفتگو درباره: عمده پیراهن مردانه — ۲٬۲۵۰٬۰۰۰ تومان');
    expect(systemPreview).toHaveClass('italic');
    expect(systemPreview).toHaveClass('text-muted-foreground');

    const textPreview = screen.getByText('سلام، موجودی همین رنگ هم دارید؟');
    expect(textPreview).not.toHaveClass('italic');
  });

  it('renders the sold/expired lot chips and hides the verified badge while false', async () => {
    fetchMock.mockImplementation(async () =>
      ok(
        inboxPage([
          conversationItemFixture({
            id: 'conv-sold',
            lot: { ...conversationItemFixture().lot, status: 'SOLD' },
          }),
        ]),
      ),
    );
    renderInbox();

    expect(await screen.findByText('فروخته شده')).toBeInTheDocument(); // LOT_STATUS_LABELS_FA.SOLD
    expect(screen.queryByText('تأییدشده')).not.toBeInTheDocument(); // TRS-001 hard-false placeholder
  });

  it('shows the verified badge when the counterpart is verified', async () => {
    fetchMock.mockImplementation(async () =>
      ok(
        inboxPage([
          conversationItemFixture({
            counterpart: {
              id: 'user-2',
              name: 'مینا رضایی',
              avatarUrl: null,
              verified: true,
            },
          }),
        ]),
      ),
    );
    renderInbox();

    expect(await screen.findByText('تأییدشده')).toBeInTheDocument();
  });

  it('renders a placeholder tile when the lot has no cover thumb', async () => {
    fetchMock.mockImplementation(async () =>
      ok(
        inboxPage([
          conversationItemFixture({
            lot: { ...conversationItemFixture().lot, coverThumbUrl: null },
          }),
        ]),
      ),
    );
    const { container } = renderInbox();

    await screen.findByRole('link', { name: /عمده پیراهن مردانه/ });
    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'تصویری برای این لات موجود نیست' })).toBeInTheDocument();
  });
});

describe('ChatInbox states', () => {
  it('shows the empty state with a CTA to /lots', async () => {
    fetchMock.mockImplementation(async () => ok(inboxPage([])));
    renderInbox();

    expect(await screen.findByText('هنوز گفتگویی ندارید')).toBeInTheDocument();
    const cta = screen.getByRole('link', { name: 'مشاهده لات‌ها' });
    expect(cta).toHaveAttribute('href', '/lots');
  });

  it('shows skeletons while the first page loads', () => {
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    renderInbox();
    expect(screen.getByRole('status', { name: 'در حال بارگذاری گفتگوها' })).toBeInTheDocument();
  });

  it('shows the error state with retry, which recovers into the list', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async () => {
      throw new Error('network down');
    });
    renderInbox();

    expect(await screen.findByText('دریافت گفتگوها ناموفق بود')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /تلاش مجدد/ })).toBeInTheDocument();

    fetchMock.mockImplementation(async () => ok(inboxPage([conversationItemFixture()])));
    await user.click(screen.getByRole('button', { name: /تلاش مجدد/ }));

    expect(await screen.findByText('عمده پیراهن مردانه — ۵۰ عدد')).toBeInTheDocument();
  });

  it('loads the next page via the «بیشتر» button and shows the end caption when done', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.includes('page=1')) {
        return ok(inboxPage([conversationItemFixture({ id: 'conv-1' })], 1, 21));
      }
      return ok(inboxPage([conversationItemFixture({ id: 'conv-2' })], 2, 21));
    });
    renderInbox();

    await screen.findByText('عمده پیراهن مردانه — ۵۰ عدد');
    await user.click(screen.getByRole('button', { name: 'بیشتر' }));

    await waitFor(() =>
      expect(
        screen
          .getAllByRole('link', { name: /عمده پیراهن مردانه/ })
          .map((row) => row.getAttribute('href')),
      ).toEqual(['/chat/conv-1', '/chat/conv-2']),
    );
    expect(screen.getByText('همه گفتگوها نمایش داده شد')).toBeInTheDocument();
  });
});

describe('ChatInbox WS fallback badge (CHT-004 contract)', () => {
  it('shows the fallback badge only while pollingActive', async () => {
    mockSocketState.pollingActive = true;
    renderInbox();

    // The badge renders immediately (it does not depend on the data), so wait
    // for the ROW first — proving the query still works in fallback mode —
    // then assert the badge on the rendered inbox.
    expect(await screen.findByRole('link', { name: /عمده پیراهن مردانه/ })).toBeInTheDocument();
    expect(screen.getByText('اتصال زنده قطع است — به‌روزرسانی خودکار متوقف')).toBeInTheDocument();
  });

  it('hides the badge while the live socket is connected', async () => {
    renderInbox();
    await screen.findByText('عمده پیراهن مردانه — ۵۰ عدد');
    expect(
      screen.queryByText('اتصال زنده قطع است — به‌روزرسانی خودکار متوقف'),
    ).not.toBeInTheDocument();
  });
});
