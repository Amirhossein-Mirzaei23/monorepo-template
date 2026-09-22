import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';

// jest.mock's string argument is resolved literally, so the alias fails here.
jest.mock('../../../providers/auth-provider', () => ({
  useAuth: () => ({ accessToken: () => 'test-access-token' }),
}));

const mockReplace = jest.fn();
const mockParams = { current: new URLSearchParams() };

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn() }),
  usePathname: () => '/admin/users',
  useSearchParams: () => mockParams.current,
}));

import { AdminUsers } from '../components/admin-users';
import { USER_STATUS_LABELS_FA } from '../schemas/users-schema';

/**
 * Admin users list (Task 05): the no-params default (the overview newUsers
 * link), the status deep-links (?status=…), filter→URL sync, the zero state,
 * and deterministic pagination — exercised through the mocked BFF fetch hop
 * (admin-overview test idiom: real providers, mocked fetch).
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

function userFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    phone: '09121234567',
    email: null,
    name: 'سارا محمدی',
    role: 'USER',
    status: 'ACTIVE',
    accountRoles: ['SELLER'],
    onboardingCompletedAt: '2026-09-01T08:00:00.000Z',
    deletedAt: null,
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-10T08:00:00.000Z',
    profile: {
      displayName: 'سارا',
      businessName: 'فروشگاه آفتاب',
      province: 'tehran',
      city: 'tehran',
      isBuyer: false,
      isSeller: true,
      successfulDeals: 3,
    },
    ...overrides,
  };
}

function pageOf(users: ReturnType<typeof userFixture>[], total = users.length) {
  return { items: users, total, page: 1, limit: 20 };
}

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof global.fetch;
  mockReplace.mockClear();
  mockParams.current = new URLSearchParams();
  fetchMock.mockResolvedValue(ok(pageOf([])));
});

describe('AdminUsers — no params and deep links', () => {
  it('renders fine with NO params (the overview newUsers link) and calls the bare list URL', async () => {
    fetchMock.mockResolvedValue(ok(pageOf([userFixture()])));
    render(<AdminUsers />, { wrapper: createWrapper() });

    expect(await screen.findByText('سارا محمدی')).toBeInTheDocument();
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(String(url)).toBe('/api/admin/users');
  });

  it('honors the overview status deep-link (?status=SUSPENDED) in the fetch URL', async () => {
    mockParams.current = new URLSearchParams({ status: 'SUSPENDED' });
    render(<AdminUsers />, { wrapper: createWrapper() });

    await screen.findByRole('group', { name: 'فیلتر وضعیت' });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(String(url)).toContain('status=SUSPENDED');
    // The matching chip is pressed.
    expect(
      screen.getByRole('button', { pressed: true, name: USER_STATUS_LABELS_FA.SUSPENDED }),
    ).toBeInTheDocument();
  });

  it('shows the zero state when no user matches the filters', async () => {
    render(<AdminUsers />, { wrapper: createWrapper() });

    expect(await screen.findByTestId('admin-users-empty')).toBeInTheDocument();
    expect(screen.getByText('کاربری با این مشخصات پیدا نشد')).toBeInTheDocument();
  });
});

describe('AdminUsers — populated list', () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue(
      ok(
        pageOf(
          [
            userFixture(),
            userFixture({
              id: 'user-2',
              phone: '09120000001',
              name: 'علی رضایی',
              status: 'SUSPENDED',
              profile: null,
            }),
          ],
          45,
        ),
      ),
    );
  });

  it('renders rows with business name, phone and Persian status labels', async () => {
    render(<AdminUsers />, { wrapper: createWrapper() });

    expect(await screen.findByText('سارا محمدی')).toBeInTheDocument();
    expect(screen.getByText('علی رضایی')).toBeInTheDocument();
    expect(screen.getByText('فروشگاه آفتاب')).toBeInTheDocument();
    expect(screen.getAllByText(USER_STATUS_LABELS_FA.ACTIVE).length).toBeGreaterThan(0);
    expect(screen.getAllByText(USER_STATUS_LABELS_FA.SUSPENDED).length).toBeGreaterThan(0);
    // Rows deep-link to the detail pages.
    expect(screen.getByRole('link', { name: /سارا محمدی/ })).toHaveAttribute(
      'href',
      '/admin/users/user-1',
    );
  });

  it('reports the deterministic pagination state in Persian digits', async () => {
    render(<AdminUsers />, { wrapper: createWrapper() });

    expect(await screen.findByText('۴۵ کاربر — صفحه ۱ از ۳')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'صفحه قبل' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'صفحه بعد' })).toBeEnabled();
  });

  it('navigates pages through the URL (?page=2)', async () => {
    const user = userEvent.setup();
    render(<AdminUsers />, { wrapper: createWrapper() });

    await screen.findByText('سارا محمدی');
    await user.click(screen.getByRole('button', { name: 'صفحه بعد' }));

    expect(mockReplace).toHaveBeenCalledWith('/admin/users?page=2', { scroll: false });
  });
});

describe('AdminUsers — filter → URL sync', () => {
  it('syncs the search box into ?q= on submit', async () => {
    const user = userEvent.setup();
    render(<AdminUsers />, { wrapper: createWrapper() });

    await screen.findByRole('search', { name: 'فرم جست‌وجوی کاربران' });
    await user.type(screen.getByLabelText('جست‌وجوی کاربران'), 'آفتاب');
    await user.click(screen.getByRole('button', { name: /جست‌وجو/ }));

    expect(mockReplace).toHaveBeenCalledWith('/admin/users?q=%D8%A2%D9%81%D8%AA%D8%A7%D8%A8', {
      scroll: false,
    });
  });

  it('syncs status, role and onboarding chips into the URL params', async () => {
    const user = userEvent.setup();
    render(<AdminUsers />, { wrapper: createWrapper() });

    await screen.findByRole('group', { name: 'فیلتر وضعیت' });
    await user.click(screen.getByRole('button', { name: USER_STATUS_LABELS_FA.BLOCKED }));
    expect(mockReplace).toHaveBeenCalledWith('/admin/users?status=BLOCKED', { scroll: false });

    await user.click(screen.getByRole('button', { name: 'مدیر', pressed: false }));
    expect(mockReplace).toHaveBeenCalledWith('/admin/users?role=ADMIN', { scroll: false });

    await user.click(screen.getByRole('button', { name: 'بدون آنبوردینگ' }));
    expect(mockReplace).toHaveBeenCalledWith('/admin/users?onboarded=false', { scroll: false });
  });

  it('clears the filter by returning to the bare path (همه chip)', async () => {
    mockParams.current = new URLSearchParams({ status: 'BLOCKED' });
    const user = userEvent.setup();
    render(<AdminUsers />, { wrapper: createWrapper() });

    await screen.findByRole('group', { name: 'فیلتر وضعیت' });
    await user.click(screen.getByRole('button', { name: 'همه' }));

    expect(mockReplace).toHaveBeenCalledWith('/admin/users', { scroll: false });
  });
});

describe('AdminUsers — loading and error states', () => {
  it('shows loading skeletons while the query is in flight', () => {
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    render(<AdminUsers />, { wrapper: createWrapper() });

    expect(screen.getByRole('status', { name: 'در حال بارگذاری کاربران' })).toBeInTheDocument();
  });

  it('shows the Persian error state with a retry button', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    render(<AdminUsers />, { wrapper: createWrapper() });

    expect(await screen.findByTestId('admin-users-error')).toBeInTheDocument();
    expect(screen.getByText('دریافت فهرست کاربران ناموفق بود')).toBeInTheDocument();
  });
});
