import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
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
  usePathname: () => '/dashboard/lots',
  useSearchParams: () => mockParams.current,
}));

import { ToastProvider } from '@/components/ui/toast';
import { MyLotsPage } from '../components/my-lots-page';
import { MY_LOTS_PAGE_SIZE } from '../hooks/use-my-lots';
import { ownerLotFixture } from '../testing/fixtures';

/**
 * LOT-005 component tests: URL-synced tabs, the row card (status chip +
 * STATUS-SCOPED quick actions per the LOT-003 transition table), the Persian
 * confirm dialogs before every mutation, the mutation calls themselves, and
 * the loading/empty/error states — exercised through the mocked BFF (fetch),
 * like the wizard suite.
 */

const fetchMock = jest.fn();

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    );
  };
}

function ok(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function minePage(lots: ReturnType<typeof ownerLotFixture>[]) {
  return { items: lots, total: lots.length, page: 1, limit: MY_LOTS_PAGE_SIZE };
}

function calls(): Array<{ path: string; method: string }> {
  return (global.fetch as jest.Mock).mock.calls.map(([input, init]) => ({
    path: String(input),
    method: ((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase(),
  }));
}

/** Stub one lot for a given tab query, anything else as an empty page. */
function stubTabLot(overrides: Parameters<typeof ownerLotFixture>[0], tab: string) {
  fetchMock.mockImplementation(async (input: unknown) => {
    const url = String(input);
    if (url.includes(`status=${tab}`)) {
      return ok(minePage([ownerLotFixture(overrides)]));
    }
    return ok(minePage([]));
  });
}

function renderPage(tab?: string) {
  mockParams.current = new URLSearchParams(tab !== undefined ? { tab } : {});
  mockReplace.mockClear();
  fetchMock.mockClear();
  return render(<MyLotsPage />, { wrapper: createWrapper() });
}

/** Same formatter the row uses (lib/format.ts jalaliFormat options). */
const expectedExpiry = (iso: string): string =>
  new Intl.DateTimeFormat('fa-IR', { calendar: 'persian' }).format(new Date(iso));

beforeEach(() => {
  fetchMock.mockReset();
  mockReplace.mockReset();
  global.fetch = fetchMock as unknown as typeof global.fetch;
  // Default: one ACTIVE lot on the ACTIVE query, one distinct PAUSED lot on
  // the PAUSED query (the merged فعال tab fires both).
  fetchMock.mockImplementation(async (input: unknown) => {
    const url = String(input);
    if (url.includes('status=PAUSED')) {
      return ok(
        minePage([ownerLotFixture({ id: 'lot-paused', status: 'PAUSED', title: 'پالت موقت' })]),
      );
    }
    if (url.startsWith('/api/lots/mine')) {
      return ok(minePage([ownerLotFixture({ status: 'ACTIVE' })]));
    }
    return ok(minePage([]));
  });
});

/** Query helpers scoped to ONE row's action group (rows share button labels). */
function rowActions(title: string) {
  return within(screen.getByRole('group', { name: `اقدامات ${title}` }));
}

describe('MyLotsPage tabs', () => {
  it('renders all six status tabs with fa labels', async () => {
    renderPage();
    expect(await screen.findByText('عمده پیراهن مردانه — ۵۰ عدد')).toBeInTheDocument();

    for (const label of [
      'فعال',
      'در انتظار بررسی',
      'پیش‌نویس',
      'رد شده',
      'فروخته شده',
      'منقضی شده',
    ]) {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
    }
  });

  it('switches tabs through the URL (?tab=…)', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('عمده پیراهن مردانه — ۵۰ عدد');

    await user.click(screen.getByRole('tab', { name: 'پیش‌نویس' }));

    expect(mockReplace).toHaveBeenCalledWith('/dashboard/lots?tab=DRAFT', { scroll: false });
  });

  it('reads the initial tab from the URL and queries only that status', async () => {
    renderPage('PENDING_REVIEW');

    await waitFor(() => {
      const mineCalls = calls().filter((call) => call.path.startsWith('/api/lots/mine'));
      expect(mineCalls.length).toBeGreaterThan(0);
      for (const call of mineCalls) {
        expect(call.path).toContain('status=PENDING_REVIEW');
      }
    });
  });
});

describe('MyLotsPage rows', () => {
  it('renders a row card with title, price, quantity and Jalali expiry + status chip', async () => {
    stubTabLot({ status: 'DRAFT' }, 'DRAFT');
    renderPage('DRAFT');
    await screen.findByText('عمده پیراهن مردانه — ۵۰ عدد');

    // The chip is the only span with the status label (tabs are <button>s).
    expect(screen.getByText('پیش‌نویس', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('۱۱۲٬۵۰۰٬۰۰۰ تومان')).toBeInTheDocument();
    expect(
      screen.getByText(`مهلت: تا ${expectedExpiry('2026-10-05T00:00:00.000Z')}`),
    ).toBeInTheDocument();
    // Empty gallery → placeholder icon, no <img>.
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('quick actions for an ACTIVE row: pause/mark-sold/duplicate/edit/delete, no resume', async () => {
    renderPage('live');
    await screen.findByText('عمده پیراهن مردانه — ۵۰ عدد');

    const actions = rowActions('عمده پیراهن مردانه — ۵۰ عدد');
    expect(actions.getByRole('link', { name: 'ویرایش' })).toHaveAttribute(
      'href',
      '/dashboard/lots/lot-1/edit',
    );
    expect(actions.getByRole('button', { name: 'توقف موقت' })).toBeInTheDocument();
    expect(actions.queryByRole('button', { name: 'فعال‌سازی مجدد' })).not.toBeInTheDocument();
    expect(actions.getByRole('button', { name: 'ثبت فروش' })).toBeInTheDocument();
    expect(actions.getByRole('button', { name: 'تکثیر آگهی' })).toBeInTheDocument();
    expect(actions.getByRole('button', { name: 'حذف آگهی' })).toBeInTheDocument();
  });

  it('action matrix: a SOLD row keeps duplicate/edit but loses delete, pause, resume, mark-sold', async () => {
    stubTabLot({ status: 'SOLD' }, 'SOLD');
    renderPage('SOLD');
    await screen.findByText('عمده پیراهن مردانه — ۵۰ عدد');

    const actions = rowActions('عمده پیراهن مردانه — ۵۰ عدد');
    expect(actions.getByRole('button', { name: 'تکثیر آگهی' })).toBeInTheDocument();
    expect(actions.queryByRole('button', { name: 'حذف آگهی' })).not.toBeInTheDocument();
    expect(actions.queryByRole('button', { name: 'توقف موقت' })).not.toBeInTheDocument();
    expect(actions.queryByRole('button', { name: 'فعال‌سازی مجدد' })).not.toBeInTheDocument();
    expect(actions.queryByRole('button', { name: 'ثبت فروش' })).not.toBeInTheDocument();
  });

  it('action matrix: a PAUSED row offers resume instead of pause', async () => {
    renderPage('live');
    await screen.findByText('پالت موقت');

    const actions = rowActions('پالت موقت');
    expect(actions.getByRole('button', { name: 'فعال‌سازی مجدد' })).toBeInTheDocument();
    expect(actions.queryByRole('button', { name: 'توقف موقت' })).not.toBeInTheDocument();
    expect(actions.getByRole('button', { name: 'ثبت فروش' })).toBeInTheDocument();
  });
});

describe('MyLotsPage mutations', () => {
  it('confirms pause in a Persian dialog, then POSTs the lifecycle action', async () => {
    const user = userEvent.setup();
    renderPage('live');
    await screen.findByText('عمده پیراهن مردانه — ۵۰ عدد');

    await user.click(
      rowActions('عمده پیراهن مردانه — ۵۰ عدد').getByRole('button', { name: 'توقف موقت' }),
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('توقف موقت آگهی');
    expect(dialog).toHaveTextContent('ادامه می‌دهید؟');

    await user.click(within(dialog).getByRole('button', { name: 'توقف موقت' }));

    await waitFor(() => {
      expect(
        calls().some((call) => call.path === '/api/lots/lot-1/pause' && call.method === 'POST'),
      ).toBe(true);
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('confirms delete in a danger dialog, then DELETEs the lot', async () => {
    const user = userEvent.setup();
    renderPage('live');
    await screen.findByText('عمده پیراهن مردانه — ۵۰ عدد');

    await user.click(
      rowActions('عمده پیراهن مردانه — ۵۰ عدد').getByRole('button', { name: 'حذف آگهی' }),
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('حذف آگهی');
    expect(dialog).toHaveTextContent('قابل بازگشت نیست');

    await user.click(within(dialog).getByRole('button', { name: 'حذف آگهی' }));

    await waitFor(() => {
      expect(
        calls().some((call) => call.path === '/api/lots/lot-1' && call.method === 'DELETE'),
      ).toBe(true);
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('cancel closes the dialog without any mutation call', async () => {
    const user = userEvent.setup();
    renderPage('live');
    await screen.findByText('عمده پیراهن مردانه — ۵۰ عدد');

    await user.click(
      rowActions('عمده پیراهن مردانه — ۵۰ عدد').getByRole('button', { name: 'تکثیر آگهی' }),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'انصراف' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(calls().some((call) => call.method !== 'GET')).toBe(false);
  });
});

describe('MyLotsPage states', () => {
  it('shows skeletons while the inventory is loading', () => {
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    renderPage('DRAFT');
    expect(screen.getByRole('status', { name: 'در حال بارگذاری آگهی‌ها' })).toBeInTheDocument();
  });

  it('shows the per-tab empty state with a «آگهی جدید» CTA', async () => {
    fetchMock.mockImplementation(async () => ok(minePage([])));
    renderPage('EXPIRED');

    expect(await screen.findByText('هنوز آگهی‌ای در دسته «منقضی شده» ندارید')).toBeInTheDocument();
    const cta = screen.getAllByRole('link', { name: 'آگهی جدید' });
    expect(cta.length).toBeGreaterThan(0);
    expect(cta[0]).toHaveAttribute('href', '/dashboard/lots/new');
  });

  it('shows the error state with retry, which recovers into the list', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async () => {
      throw new Error('network down');
    });
    renderPage('DRAFT');

    expect(await screen.findByText('دریافت آگهی‌ها ناموفق بود')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /تلاش مجدد/ })).toBeInTheDocument();

    stubTabLot({ status: 'DRAFT' }, 'DRAFT');
    await user.click(screen.getByRole('button', { name: /تلاش مجدد/ }));

    expect(await screen.findByText('عمده پیراهن مردانه — ۵۰ عدد')).toBeInTheDocument();
  });
});
