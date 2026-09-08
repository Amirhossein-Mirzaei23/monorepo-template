import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';

// jest.mock's string argument is resolved literally, so the alias fails here
// (the features/lots precedent).
jest.mock('../../../providers/auth-provider', () => ({
  useAuth: () => ({ accessToken: () => 'test-access-token' }),
}));

const mockReplace = jest.fn();
const mockParams = { current: new URLSearchParams() };

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn() }),
  usePathname: () => '/offers',
  useSearchParams: () => mockParams.current,
}));

import { lotDetailFixture } from '@/features/marketplace';

import { ToastProvider } from '@/components/ui/toast';
import { OFFERS_PAGE_SIZE } from '../api/offers-api';
import { OffersPage } from '../components/offers-page';
import { offerFixture } from '../testing/fixtures';

/**
 * OFR-004 page tests: the role-aware دریافتی/ارسالی tabs (URL-synced), the
 * list rendering with the status chips, empty states per role, the error
 * retry, and the counter flow hosting the shared sheet — exercised through
 * the mocked BFF (fetch), like the my-lots page suite.
 */

const fetchMock = jest.fn();

function ok(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function offersPage(items: ReturnType<typeof offerFixture>[]) {
  return { items, total: items.length, page: 1, limit: OFFERS_PAGE_SIZE };
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

function renderPage(tab?: string) {
  mockParams.current = new URLSearchParams(tab !== undefined ? { tab } : {});
  mockReplace.mockClear();
  fetchMock.mockClear();
  return render(<OffersPage />, { wrapper: createWrapper() });
}

beforeEach(() => {
  fetchMock.mockReset();
  mockReplace.mockReset();
  global.fetch = fetchMock as unknown as typeof global.fetch;
  fetchMock.mockImplementation(async (input: unknown) => {
    const url = String(input);
    if (url.startsWith('/api/offers?')) {
      const role = new URL(url, 'http://localhost:3000').searchParams.get('role');
      if (role === 'seller') {
        return ok(offersPage([offerFixture({ id: 'o-1', myRole: 'seller', status: 'PENDING' })]));
      }
      return ok(offersPage([offerFixture({ id: 'o-2', myRole: 'buyer', status: 'ACCEPTED' })]));
    }
    if (url.startsWith('/api/lots/7Kd2Qm9x')) {
      // Bounds wide enough for the countered offer's 500 pieces.
      return ok(lotDetailFixture({ availableQuantity: 600 }));
    }
    return ok({});
  });
});

describe('OffersPage tabs', () => {
  it('defaults to the دریافتی (seller) tab and renders its offers', async () => {
    renderPage();

    expect(await screen.findByText('عمده پیراهن مردانه — ۵۰ عدد')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'دریافتی' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'ارسالی' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByText('در انتظار پاسخ')).toBeInTheDocument();
  });

  it('switches to the ارسالی tab via the URL (?tab=buyer) and lists sent offers', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('عمده پیراهن مردانه — ۵۰ عدد');
    await user.click(screen.getByRole('tab', { name: 'ارسالی' }));

    expect(mockReplace).toHaveBeenCalledWith('/offers?tab=buyer', { scroll: false });
  });

  it('a deep-linked ?tab=buyer renders the sent list (پذیرفته شده state)', async () => {
    renderPage('buyer');

    expect(await screen.findByText('پذیرفته شده')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'ارسالی' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('OffersPage empty + error states', () => {
  it('shows the buyer empty state with the browse CTA on an empty ارسالی tab', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.startsWith('/api/offers?role=seller')) {
        return ok(offersPage([offerFixture({ myRole: 'seller' })]));
      }
      if (url.startsWith('/api/offers?role=buyer')) {
        return ok(offersPage([]));
      }
      return ok({});
    });
    renderPage('buyer');

    const empty = await screen.findByTestId('offers-empty');
    expect(within(empty).getByText('هنوز پیشنهادی نفرستاده‌اید')).toBeInTheDocument();
    expect(within(empty).getByRole('link', { name: 'مشاهده لات‌ها' })).toHaveAttribute(
      'href',
      '/lots',
    );
  });

  it('shows the seller empty state copy on an empty دریافتی tab', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.startsWith('/api/offers?role=seller')) {
        return ok(offersPage([]));
      }
      return ok(offersPage([]));
    });
    renderPage('seller');

    const empty = await screen.findByTestId('offers-empty');
    expect(within(empty).getByText('هنوز پیشنهادی دریافت نکرده‌اید')).toBeInTheDocument();
    expect(within(empty).queryByRole('link')).not.toBeInTheDocument();
  });

  it('the error state offers a retry that refetches', async () => {
    fetchMock.mockImplementation(async () => {
      throw new Error('network down');
    });
    const view = renderPage();

    expect(await screen.findByText('دریافت پیشنهادها ناموفق بود')).toBeInTheDocument();
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.startsWith('/api/offers?role=seller')) {
        return ok(offersPage([offerFixture({ myRole: 'seller' })]));
      }
      return ok(offersPage([]));
    });

    await userEvent.click(screen.getByRole('button', { name: /تلاش مجدد/ }));
    expect(await screen.findByText('عمده پیراهن مردانه — ۵۰ عدد')).toBeInTheDocument();
    view.unmount();
  });
});

describe('OffersPage counter flow', () => {
  it('the seller counter button opens the shared sheet seeded with the offer', async () => {
    const user = userEvent.setup();
    renderPage('seller');

    await screen.findByText('عمده پیراهن مردانه — ۵۰ عدد');
    await user.click(screen.getByRole('button', { name: 'پیشنهاد متقابل' }));

    const dialog = await screen.findByRole('dialog', { name: 'ارسال پیشنهاد متقابل' });
    await waitFor(() => {
      const quantity = within(dialog).getByLabelText('تعداد (عدد)') as HTMLInputElement;
      expect(quantity.value).toBe('500');
    });
    // The sheet resolved the lot context through the public detail endpoint.
    expect(global.fetch).toHaveBeenCalledWith('/api/lots/7Kd2Qm9x', expect.anything());
  });
});
