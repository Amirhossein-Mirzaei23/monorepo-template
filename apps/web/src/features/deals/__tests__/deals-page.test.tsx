import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';

// jest.mock's string argument is resolved literally, so the alias fails here
// (the offers-page precedent).
jest.mock('../../../providers/auth-provider', () => ({
  useAuth: () => ({ accessToken: () => 'test-access-token' }),
}));

const mockReplace = jest.fn();
const mockParams = { current: new URLSearchParams() };

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn() }),
  usePathname: () => '/deals',
  useSearchParams: () => mockParams.current,
}));

import { ToastProvider } from '@/components/ui/toast';
import { DEALS_PAGE_SIZE } from '../api/deals-api';
import { DealsPage } from '../components/deals-page';
import { dealFixture } from '../testing/fixtures';

/**
 * DEAL-004 page tests: the role-aware خرید/فروش tabs (URL-synced), the status
 * chip row, list rendering, and the empty state — exercised through the
 * mocked BFF (fetch), the offers-page suite's shape.
 */

const fetchMock = jest.fn();

function ok(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function dealsPage(items: ReturnType<typeof dealFixture>[]) {
  return { items, total: items.length, page: 1, limit: DEALS_PAGE_SIZE };
}

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

function renderPage(params: Record<string, string> = {}) {
  mockParams.current = new URLSearchParams(params);
  mockReplace.mockClear();
  fetchMock.mockClear();
  return render(<DealsPage />, { wrapper: createWrapper() });
}

beforeEach(() => {
  fetchMock.mockReset();
  mockReplace.mockReset();
  global.fetch = fetchMock as unknown as typeof global.fetch;
  fetchMock.mockImplementation(async (input: unknown) => {
    const url = new URL(String(input), 'http://localhost:3000');
    if (url.pathname === '/api/deals') {
      const role = url.searchParams.get('role');
      const status = url.searchParams.get('status');
      if (status === 'COMPLETED') {
        return ok(dealsPage([]));
      }
      return ok(
        dealsPage([
          dealFixture({
            id: role === 'seller' ? 'd-seller' : 'd-buyer',
            myRole: role === 'seller' ? 'seller' : 'buyer',
          }),
        ]),
      );
    }
    return ok({});
  });
});

describe('DealsPage', () => {
  it('defaults to the خرید (buyer) tab and renders its deals', async () => {
    renderPage();

    const card = await screen.findByText('عمده پیراهن مردانه — ۵۰ عدد');
    expect(card).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'خرید' })).toHaveAttribute('aria-selected', 'true');
    expect(card.closest('[data-testid="deal-card"]')).not.toBeNull();
    expect(
      within(card.closest('[data-testid="deal-card"]') as HTMLElement).getByText('در مذاکره'),
    ).toBeInTheDocument();
  });

  it('switches tabs via the URL and lists the other side', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('عمده پیراهن مردانه — ۵۰ عدد');
    await user.click(screen.getByRole('tab', { name: 'فروش' }));

    expect(mockReplace).toHaveBeenCalledWith('/deals?tab=seller', { scroll: false });
  });

  it('the status chip row narrows by lifecycle stage (?status=)', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('عمده پیراهن مردانه — ۵۰ عدد');
    await user.click(screen.getByRole('button', { name: 'تکمیل شده' }));

    expect(mockReplace).toHaveBeenCalledWith('/deals?tab=buyer&status=COMPLETED', {
      scroll: false,
    });
  });

  it('shows the empty state when the filter matches nothing', async () => {
    renderPage({ tab: 'buyer', status: 'COMPLETED' });

    const empty = await screen.findByTestId('deals-empty');
    expect(within(empty).getByText('هنوز معامله‌ای نداشته‌اید')).toBeInTheDocument();
  });
});
