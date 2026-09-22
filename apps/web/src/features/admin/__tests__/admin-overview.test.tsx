import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';

// jest.mock's string argument is resolved literally, so the alias fails here.
jest.mock('../../../providers/auth-provider', () => ({
  useAuth: () => ({ accessToken: () => 'test-access-token' }),
}));

import { AdminOverview } from '../components/admin-overview';

/**
 * Admin overview dashboard (Task 04): the zero state («به‌زودی» footnotes and
 * empty queues), the populated state (Persian digits, queue rows oldest
 * visible, filter-intent links) and the loading/error states — exercised
 * through the mocked BFF fetch hop (my-lots-page.test.tsx pattern).
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

const ZERO_PAYLOAD = {
  counts: {
    pendingReviewLots: 0,
    openReports: 0,
    pendingVerifications: 0,
    disputedDeals: 0,
    activeUsers: 0,
    suspendedUsers: 0,
    blockedUsers: 0,
    newUsersLast7Days: 0,
  },
  oldestPendingLots: [],
  oldestOpenReports: [],
};

const POPULATED_PAYLOAD = {
  counts: {
    pendingReviewLots: 7,
    openReports: 0,
    pendingVerifications: 0,
    disputedDeals: 2,
    activeUsers: 120,
    suspendedUsers: 3,
    blockedUsers: 1,
    newUsersLast7Days: 14,
  },
  oldestPendingLots: [
    {
      id: 'lot-old',
      code: 'AAA11111',
      title: 'پالت قدیمی',
      status: 'PENDING_REVIEW',
      createdAt: '2026-09-01T08:00:00.000Z',
    },
    {
      id: 'lot-new',
      code: 'BBB22222',
      title: 'پالت تازه‌تر',
      status: 'PENDING_REVIEW',
      createdAt: '2026-09-15T08:00:00.000Z',
    },
  ],
  oldestOpenReports: [],
};

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof global.fetch;
  fetchMock.mockResolvedValue(ok(ZERO_PAYLOAD));
});

describe('AdminOverview — zero state', () => {
  it('renders all counter cards as Persian-digit zeros over their queue links', async () => {
    render(<AdminOverview />, { wrapper: createWrapper() });

    expect(await screen.findByText('نمای کلی مدیریت')).toBeInTheDocument();

    // Every counted surface shows its real zero (۰) as Persian digits.
    expect(screen.getByText('لات‌های در انتظار بررسی')).toBeInTheDocument();
    expect(screen.getByText('گزارش‌های باز')).toBeInTheDocument();
    expect(screen.getByText('تأییدهای در انتظار')).toBeInTheDocument();
    expect(screen.getByText('معاملات درگیر اختلاف')).toBeInTheDocument();
    expect(screen.getAllByText('۰').length).toBeGreaterThanOrEqual(8);

    // Filter intent: the pending-lots card opens the pre-filtered queue page.
    expect(screen.getByRole('link', { name: /لات‌های در انتظار بررسی/ })).toHaveAttribute(
      'href',
      '/admin/lots?status=PENDING_REVIEW',
    );
    expect(screen.getByRole('link', { name: /معاملات درگیر اختلاف/ })).toHaveAttribute(
      'href',
      '/admin/deals?status=DISPUTED',
    );
    expect(screen.getByRole('link', { name: /کاربران تعلیق‌شده/ })).toHaveAttribute(
      'href',
      '/admin/users?status=SUSPENDED',
    );
    // The 7-day count is time-based — it must NOT fake a status filter.
    expect(screen.getByRole('link', { name: /کاربران جدید/ })).toHaveAttribute(
      'href',
      '/admin/users',
    );
  });

  it('marks the not-yet-built domains explicitly and shows both queues empty', async () => {
    render(<AdminOverview />, { wrapper: createWrapper() });

    expect(await screen.findByText('پس از فعال‌سازی بخش گزارش‌ها')).toBeInTheDocument();
    expect(screen.getByText('پس از فعال‌سازی بخش تأییدها')).toBeInTheDocument();
    expect(
      screen.getByText('صف بررسی خالی است — هیچ لاتی در انتظار بررسی نیست.'),
    ).toBeInTheDocument();
    expect(screen.getByText('فعلاً گزارشی برای بررسی نیست.')).toBeInTheDocument();
  });

  it('calls the BFF overview endpoint with the bearer token exactly once', async () => {
    render(<AdminOverview />, { wrapper: createWrapper() });
    await screen.findByText('نمای کلی مدیریت');

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [input, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit | undefined];
    expect(String(input)).toBe('/api/admin/overview');
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-access-token');
  });
});

describe('AdminOverview — populated state', () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue(ok(POPULATED_PAYLOAD));
  });

  it('renders non-zero Persian-digit counts', async () => {
    render(<AdminOverview />, { wrapper: createWrapper() });

    expect(await screen.findByText('۷')).toBeInTheDocument(); // pendingReviewLots
    expect(screen.getByText('۲')).toBeInTheDocument(); // disputedDeals
    expect(screen.getByText('۱۲۰')).toBeInTheDocument(); // activeUsers
    expect(screen.getByText('۱۴')).toBeInTheDocument(); // newUsersLast7Days
  });

  it('lists the oldest pending lots oldest-first with code, status and relative time', async () => {
    render(<AdminOverview />, { wrapper: createWrapper() });

    expect(await screen.findByText('پالت قدیمی')).toBeInTheDocument();
    expect(screen.getByText('پالت تازه‌تر')).toBeInTheDocument();
    expect(screen.getByText('AAA11111')).toBeInTheDocument();
    expect(screen.getByText('BBB22222')).toBeInTheDocument();

    // DOM order is the API order (oldest first — the repository contract).
    const titles = ['پالت قدیمی', 'پالت تازه‌تر'].map((title) =>
      screen.getByText(title).closest('li'),
    );
    expect(titles[0]!.compareDocumentPosition(titles[1]!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('shows the reports queue empty even with a populated lots queue', async () => {
    render(<AdminOverview />, { wrapper: createWrapper() });

    expect(await screen.findByText('فعلاً گزارشی برای بررسی نیست.')).toBeInTheDocument();
  });
});

describe('AdminOverview — loading and error states', () => {
  it('shows the loading skeletons while the query is in flight', () => {
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    render(<AdminOverview />, { wrapper: createWrapper() });

    expect(screen.getByRole('status', { name: 'در حال بارگذاری نمای کلی' })).toBeInTheDocument();
    expect(screen.queryByText('نمای کلی مدیریت')).not.toBeInTheDocument();
  });

  it('shows the Persian error state with a retry that recovers into the dashboard', async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValue(new Error('network down'));
    render(<AdminOverview />, { wrapper: createWrapper() });

    expect(await screen.findByText('دریافت نمای کلی ناموفق بود')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /تلاش مجدد/ })).toBeInTheDocument();

    fetchMock.mockResolvedValue(ok(POPULATED_PAYLOAD));
    await user.click(screen.getByRole('button', { name: /تلاش مجدد/ }));

    expect(await screen.findByText('۷')).toBeInTheDocument();
  });
});
