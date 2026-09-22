import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';

// jest.mock's string argument is resolved literally, so the alias fails here.
jest.mock('../../../providers/auth-provider', () => ({
  useAuth: () => ({ accessToken: () => 'test-access-token' }),
}));

import { AdminUserDetail } from '../components/admin-user-detail';

/**
 * Admin user detail (Task 05): the allowlisted detail rendering (profile
 * summary + bounded counts), the reason dialog contract (confirm disabled
 * until a real reason), pending/disabled action states, the 409 guard error
 * rendering (self-action / last-admin), and cache invalidation on mutation
 * success — through the mocked BFF fetch hop, real providers.
 */

const USER_ID = 'user-1';

const fetchMock = jest.fn();

const DETAIL_PAYLOAD = {
  id: USER_ID,
  phone: '09121234567',
  email: 'sara@example.com',
  name: 'سارا محمدی',
  role: 'USER',
  status: 'ACTIVE',
  accountRoles: ['SELLER'],
  onboardingCompletedAt: '2026-09-01T08:00:00.000Z',
  deletedAt: null,
  createdAt: '2026-03-01T08:00:00.000Z',
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
  counts: { lots: 4, dealsAsBuyer: 2, dealsAsSeller: 7 },
};

const UPDATED_PAYLOAD = { ...DETAIL_PAYLOAD, status: 'SUSPENDED' };

function ok(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

let queryClient: QueryClient;

function renderDetail(invalidateSpy?: jest.SpyInstance) {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  if (invalidateSpy) {
    queryClient.invalidateQueries = invalidateSpy as unknown as QueryClient['invalidateQueries'];
  }
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return render(<AdminUserDetail userId={USER_ID} />, { wrapper: Wrapper });
}

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof global.fetch;
  fetchMock.mockImplementation(async (input: unknown) => {
    const url = String(input);
    if (url === `/api/admin/users/${USER_ID}`) {
      return ok(DETAIL_PAYLOAD);
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
});

describe('AdminUserDetail — rendering', () => {
  it('renders the allowlisted detail: profile summary, bounded counts, no forbidden fields', async () => {
    renderDetail();

    expect(await screen.findByText('سارا محمدی')).toBeInTheDocument();
    expect(screen.getByText('فروشگاه آفتاب')).toBeInTheDocument();
    expect(screen.getByText('۴')).toBeInTheDocument(); // lots
    expect(screen.getByText('۷')).toBeInTheDocument(); // deals as seller
    expect(screen.getByText('۳')).toBeInTheDocument(); // successful deals
    // The payload never carries secrets — nothing leaks them into the DOM.
    expect(screen.queryByText(/passwordHash/i)).not.toBeInTheDocument();
  });

  it('shows the action set for an ACTIVE user', async () => {
    renderDetail();

    expect(await screen.findByRole('button', { name: 'تعلیق' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'مسدودسازی' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'حذف' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'لغو همه نشست‌ها' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ارتقا به مدیر' })).toBeInTheDocument();
  });

  it('hides status actions for a DELETED (terminal) user', async () => {
    fetchMock.mockImplementation(async (input: unknown) =>
      String(input) === `/api/admin/users/${USER_ID}`
        ? ok({ ...DETAIL_PAYLOAD, status: 'DELETED', deletedAt: '2026-09-20T08:00:00.000Z' })
        : (() => {
            throw new Error('unexpected fetch');
          })(),
    );
    renderDetail();

    expect(await screen.findByRole('button', { name: 'ارتقا به مدیر' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'تعلیق' })).not.toBeInTheDocument();
    expect(screen.getByText(/این حساب حذف \(نرم\) شده است/)).toBeInTheDocument();
  });
});

describe('AdminUserDetail — status action with reason dialog', () => {
  it('keeps the confirm disabled until the reason is long enough, then PATCHes with the reason', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === `/api/admin/users/${USER_ID}`) {
        return ok(DETAIL_PAYLOAD);
      }
      if (url.endsWith('/status') && (init?.method ?? '') === 'PATCH') {
        return ok(UPDATED_PAYLOAD);
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    renderDetail();

    await screen.findByRole('button', { name: 'تعلیق' });
    await user.click(screen.getByRole('button', { name: 'تعلیق' }));

    const dialog = screen.getByRole('dialog', { name: 'تعلیق کاربر' });
    expect(dialog).toBeInTheDocument();

    const reason = screen.getByLabelText('دلیل (الزامی)');
    // Short reasons are rejected locally; the confirm stays disabled.
    expect(screen.getAllByRole('button', { name: 'تعلیق' }).at(-1)).toBeDisabled();
    await user.type(reason, 'کوتاه');
    await user.clear(reason);
    await user.type(reason, 'نقض قوانین فروش');
    expect(screen.getAllByRole('button', { name: 'تعلیق' }).at(-1)).toBeEnabled();
    await user.click(screen.getAllByRole('button', { name: 'تعلیق' }).at(-1)!);

    await waitFor(() => {
      const statusCall = fetchMock.mock.calls.find(
        ([input, init]) =>
          String(input).endsWith('/status') &&
          (init as RequestInit | undefined)?.method === 'PATCH',
      );
      expect(statusCall).toBeDefined();
      expect(JSON.parse((statusCall![1] as RequestInit).body as string)).toEqual({
        action: 'SUSPEND',
        reason: 'نقض قوانین فروش',
      });
    });
  });

  it('disables the dialog actions while the mutation is in flight', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (input: unknown, _init?: RequestInit) => {
      const url = String(input);
      if (url === `/api/admin/users/${USER_ID}`) {
        return ok(DETAIL_PAYLOAD);
      }
      if (url.endsWith('/status')) {
        return new Promise(() => undefined); // never settles — pending forever
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    renderDetail();

    await screen.findByRole('button', { name: 'تعلیق' });
    await user.click(screen.getByRole('button', { name: 'تعلیق' }));
    await user.type(screen.getByLabelText('دلیل (الزامی)'), 'نقض قوانین فروش');
    await user.click(screen.getAllByRole('button', { name: 'تعلیق' }).at(-1)!);

    expect(await screen.findByText('در حال انجام…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'انصراف' })).toBeDisabled();
  });

  it('invalidates the user detail, list views and overview on success', async () => {
    const user = userEvent.setup();
    const invalidateSpy = jest.fn();
    fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === `/api/admin/users/${USER_ID}`) {
        return ok(DETAIL_PAYLOAD);
      }
      if (url.endsWith('/status') && (init?.method ?? '') === 'PATCH') {
        return ok(UPDATED_PAYLOAD);
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    renderDetail(invalidateSpy);

    await screen.findByRole('button', { name: 'تعلیق' });
    await user.click(screen.getByRole('button', { name: 'تعلیق' }));
    await user.type(screen.getByLabelText('دلیل (الزامی)'), 'نقض قوانین فروش');
    await user.click(screen.getAllByRole('button', { name: 'تعلیق' }).at(-1)!);

    await waitFor(() => {
      const keys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey);
      // The `['admin','users']` prefix invalidation subsumes the detail key
      // (`['admin','users','detail',id]`) — no separate detail call.
      expect(keys).toContainEqual(['admin', 'users']);
      expect(keys).toContainEqual(['admin', 'overview']);
    });
  });
});

describe('AdminUserDetail — 409 guard errors', () => {
  function mockGuardError(
    path: string,
    code: string,
    detailOverride: Record<string, unknown> = {},
  ) {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url === `/api/admin/users/${USER_ID}`) {
        return ok({ ...DETAIL_PAYLOAD, ...detailOverride });
      }
      if (url === path) {
        return {
          ok: false,
          status: 409,
          json: async () => ({
            statusCode: 409,
            error: 'ConflictException',
            message: 'guard',
            code,
          }),
        } as unknown as Response;
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
  }

  it('renders the Persian copy for ADMIN_SELF_ACTION_FORBIDDEN', async () => {
    const user = userEvent.setup();
    mockGuardError(`/api/admin/users/${USER_ID}/status`, 'ADMIN_SELF_ACTION_FORBIDDEN');
    renderDetail();

    await screen.findByRole('button', { name: 'تعلیق' });
    await user.click(screen.getByRole('button', { name: 'تعلیق' }));
    await user.type(screen.getByLabelText('دلیل (الزامی)'), 'خودتعلیقی آزمایشی');
    await user.click(screen.getAllByRole('button', { name: 'تعلیق' }).at(-1)!);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'این اقدام روی حساب خودتان مجاز نیست.',
    );
  });

  it('renders the Persian copy for LAST_ADMIN_GUARD on the role action', async () => {
    const user = userEvent.setup();
    // An ADMIN target renders the demotion action — the demotion of the last
    // active admin is exactly what the LAST_ADMIN_GUARD refuses.
    mockGuardError(`/api/admin/users/${USER_ID}/role`, 'LAST_ADMIN_GUARD', { role: 'ADMIN' });
    renderDetail();

    await screen.findByRole('button', { name: 'تنزل به کاربر' });
    await user.click(screen.getByRole('button', { name: 'تنزل به کاربر' }));
    await user.type(screen.getByLabelText('دلیل (الزامی)'), 'تنزل آخرین مدیر');
    await user.click(screen.getByRole('button', { name: 'تنزل' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'آخرین مدیر فعال سیستم را نمی‌توان تغییر داد.',
    );
  });

  it('renders unknown guard codes as a neutral failure', async () => {
    const user = userEvent.setup();
    mockGuardError(`/api/admin/users/${USER_ID}/revoke-sessions`, 'SOMETHING_ELSE');
    renderDetail();

    await screen.findByRole('button', { name: 'لغو همه نشست‌ها' });
    await user.click(screen.getByRole('button', { name: 'لغو همه نشست‌ها' }));
    await user.type(screen.getByLabelText('دلیل (الزامی)'), 'نشست‌های مشکوک کاربر');
    await user.click(screen.getByRole('button', { name: 'لغو نشست‌ها' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'انجام این اقدام ناموفق بود. دوباره تلاش کنید.',
    );
  });
});
