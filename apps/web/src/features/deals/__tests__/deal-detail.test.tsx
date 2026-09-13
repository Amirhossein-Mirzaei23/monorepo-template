import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';

// jest.mock's string argument is resolved literally, so the alias fails here
// (the offers-page precedent).
jest.mock('../../../providers/auth-provider', () => ({
  useAuth: () => ({ accessToken: () => 'test-access-token' }),
}));

import { ToastProvider } from '@/components/ui/toast';
import { DealDetail } from '../components/deal-detail';
import { dealDetailFixture } from '../testing/fixtures';

/**
 * DEAL-004 detail tests: the matrix-mirrored action bar (own moves enabled,
 * the counterpart's disabled with the waiting tooltip), the payment mark
 * hiding once announced, the reason sheets' client-side floors, and the 409
 * toast + refresh state — exercised through the mocked BFF (fetch).
 */

const fetchMock = jest.fn();

function ok(body: unknown, status = 200): Response {
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
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    );
  };
}

function renderDetail() {
  fetchMock.mockClear();
  return render(<DealDetail code="9Xk2Qm7b" />, { wrapper: createWrapper() });
}

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof global.fetch;
  fetchMock.mockImplementation(async (input: unknown) => {
    const url = String(input);
    if (url === '/api/deals/9Xk2Qm7b') {
      return ok(dealDetailFixture());
    }
    return ok({});
  });
});

describe('DealDetail action bar (the matrix mirror)', () => {
  it('renders the terms block, the timeline, and the buyer-side actions (counterpart moves disabled)', async () => {
    renderDetail();

    const terms = await screen.findByTestId('deal-terms');
    expect(within(terms).getByText('۳٬۰۰۰٬۰۰۰ تومان')).toBeInTheDocument();
    expect(within(terms).getByText('ارسال توسط فروشنده')).toBeInTheDocument();
    expect(screen.getByTestId('status-timeline')).toBeInTheDocument();

    const bar = screen.getByTestId('deal-action-bar');
    // The buyer may accept + cancel + dispute on NEGOTIATING.
    expect(within(bar).getByRole('button', { name: 'پذیرش معامله' })).toBeEnabled();
    expect(within(bar).getByRole('button', { name: 'لغو معامله' })).toBeEnabled();
    expect(within(bar).getByRole('button', { name: 'اعلام اختلاف' })).toBeEnabled();
  });

  it('a seller view disables the buyer-only actions with the waiting tooltip', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url === '/api/deals/9Xk2Qm7b') {
        return ok(dealDetailFixture({ status: 'PAYMENT_PENDING', myRole: 'seller' }));
      }
      return ok({});
    });
    renderDetail();

    const bar = await screen.findByTestId('deal-action-bar');
    // «پرداخت کردم» is the BUYER's mark — disabled on the seller's view.
    const mark = within(bar).getByRole('button', { name: 'پرداخت کردم' });
    expect(mark).toBeDisabled();
    expect(mark).toHaveAttribute('title', 'در انتظار اقدام خریدار');
    // …while the seller's own confirm stays enabled.
    expect(within(bar).getByRole('button', { name: 'تأیید دریافت پرداخت' })).toBeEnabled();
  });

  it('the payment mark hides once the timeline carries the announcement', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url === '/api/deals/9Xk2Qm7b') {
        return ok(
          dealDetailFixture({
            status: 'PAYMENT_PENDING',
            events: [
              {
                id: 'e1',
                actorRole: 'buyer',
                fromStatus: 'PAYMENT_PENDING',
                toStatus: 'PAYMENT_PENDING',
                note: 'خریدار پرداخت را اعلام کرد',
                createdAt: '2026-09-05T10:00:00.000Z',
              },
            ],
          }),
        );
      }
      return ok({});
    });
    renderDetail();

    const bar = await screen.findByTestId('deal-action-bar');
    await waitFor(() => {
      expect(within(bar).queryByRole('button', { name: 'پرداخت کردم' })).not.toBeInTheDocument();
    });
  });
});

describe('DealDetail reason sheets + 409 handling', () => {
  it('the dispute sheet enforces the 20-char floor client-side before any request', async () => {
    const user = userEvent.setup();
    renderDetail();

    await screen.findByTestId('deal-action-bar');
    await user.click(screen.getByRole('button', { name: 'اعلام اختلاف' }));
    const dialog = screen.getByRole('dialog', { name: 'اعلام اختلاف' });
    await user.type(within(dialog).getByLabelText(/دلیل اختلاف/), 'خیلی کوتاه');
    await user.click(within(dialog).getByRole('button', { name: 'ثبت' }));

    expect(within(dialog).getByRole('alert')).toHaveTextContent('حداقل 20 نویسه');
    // Nothing was sent.
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input).includes('/transition')),
    ).toHaveLength(0);
  });

  it('a 409 cancel toasts the mapped fa copy and refetches the detail (refresh state)', async () => {
    const user = userEvent.setup();
    let detailReads = 0;
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url === '/api/deals/9Xk2Qm7b') {
        detailReads += 1;
        return ok(dealDetailFixture());
      }
      if (url === '/api/deals/9Xk2Qm7b/cancel') {
        // The counterpart cancelled first — this caller's view went stale.
        return ok(
          {
            statusCode: 409,
            error: 'Conflict',
            message: 'Cannot move a deal from CANCELLED to CANCELLED',
            code: 'ILLEGAL_TRANSITION',
            allowed: [],
          },
          409,
        );
      }
      return ok({});
    });
    const detailReadsBefore = () => detailReads;
    renderDetail();

    await screen.findByTestId('deal-action-bar');
    const readsBeforeSubmit = detailReadsBefore();
    const bar = screen.getByTestId('deal-action-bar');
    await user.click(within(bar).getByRole('button', { name: 'لغو معامله' }));
    const dialog = screen.getByRole('dialog', { name: 'لغو معامله' });
    await user.type(within(dialog).getByLabelText(/دلیل لغو/), 'خریدار منصرف شد');
    await user.click(within(dialog).getByRole('button', { name: 'ثبت' }));

    // The 409 surfaces as the mapped fa toast, and the invalidated detail is
    // refetched (the card's "toast + refresh state").
    expect(
      await screen.findByText('این عمل در وضعیت فعلی معامله امکان‌پذیر نیست'),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(detailReads).toBeGreaterThan(readsBeforeSubmit);
    });
  });
});
