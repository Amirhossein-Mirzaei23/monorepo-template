import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';

jest.mock('../../../providers/auth-provider', () => ({
  useAuth: () => ({ accessToken: () => 'test-access-token' }),
}));

import { ToastProvider } from '@/components/ui/toast';
import { OfferCard } from '../components/offer-card';
import { offerFixture } from '../testing/fixtures';

/**
 * OFR-004 card tests: the ROLE- and STATUS-scoped action bar (seller accept/
 * counter/reject on PENDING; buyer cancel), the counter callback, the
 * ACCEPTED «ایجاد معامله» strip with its DISABLED DEAL-002 CTA («به‌زودی»),
 * the terminal-state dimming, and the mutation calls themselves — against a
 * mocked BFF.
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

function renderCard(
  offer: ReturnType<typeof offerFixture>,
  onCounter?: (offer: ReturnType<typeof offerFixture>) => void,
) {
  return render(<OfferCard offer={offer} onCounter={onCounter} />, {
    wrapper: createWrapper(),
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof global.fetch;
  fetchMock.mockResolvedValue(ok(offerFixture({ status: 'ACCEPTED', myRole: 'seller' })));
});

describe('OfferCard action matrix', () => {
  it('shows the seller bar (accept/counter/reject) on a PENDING received offer', () => {
    renderCard(offerFixture({ myRole: 'seller', status: 'PENDING' }));

    expect(screen.getByRole('button', { name: 'پذیرش' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'پیشنهاد متقابل' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'رد' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'لغو پیشنهاد' })).not.toBeInTheDocument();
  });

  it('shows only the buyer cancel on a PENDING sent offer', () => {
    renderCard(offerFixture({ myRole: 'buyer', status: 'PENDING' }));

    expect(screen.getByRole('button', { name: 'لغو پیشنهاد' })).toBeInTheDocument();
    for (const sellerOnly of ['پذیرش', 'رد']) {
      expect(screen.queryByRole('button', { name: sellerOnly })).not.toBeInTheDocument();
    }
  });

  it('no action bar once the offer left PENDING (terminal states)', () => {
    for (const status of ['ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'COUNTERED'] as const) {
      const { unmount } = renderCard(offerFixture({ myRole: 'seller', status }));
      expect(screen.queryByRole('button', { name: 'پذیرش' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'لغو پیشنهاد' })).not.toBeInTheDocument();
      unmount();
    }
  });

  it('accept POSTs the decision endpoint (offerKeys invalidation refetches the list)', async () => {
    const user = userEvent.setup();
    renderCard(offerFixture({ myRole: 'seller', status: 'PENDING' }));

    await user.click(screen.getByRole('button', { name: 'پذیرش' }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/offers/offer-1/accept',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });

  it('an ACCEPTED received offer shows the DEAL-002 «ایجاد معامله» strip with the CTA disabled', () => {
    renderCard(offerFixture({ myRole: 'seller', status: 'ACCEPTED' }));

    // The strip renders for accepted offers (the list refetch flips the prop
    // after the mutation) — the CTA itself is a documented disabled placeholder
    // until DEAL-002 lands deal creation.
    expect(screen.getByText(/می‌توانید معامله را ایجاد کنید/)).toBeInTheDocument();
    const dealCta = screen.getByRole('button', { name: 'ایجاد معامله' });
    expect(dealCta).toBeDisabled();
    expect(dealCta).toHaveAttribute('title', 'به‌زودی');
    expect(screen.getByText('به‌زودی')).toBeInTheDocument();
  });

  it('reject and cancel hit their endpoints with the fresh offer back', async () => {
    const user = userEvent.setup();
    const { unmount } = renderCard(offerFixture({ myRole: 'seller', status: 'PENDING' }));
    await user.click(screen.getByRole('button', { name: 'رد' }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/offers/offer-1/reject',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    unmount();

    renderCard(offerFixture({ myRole: 'buyer', status: 'PENDING' }));
    await user.click(screen.getByRole('button', { name: 'لغو پیشنهاد' }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/offers/offer-1/cancel',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });

  it('the counter button delegates to the onCounter callback instead of POSTing', async () => {
    const user = userEvent.setup();
    const offer = offerFixture({ myRole: 'seller', status: 'PENDING' });
    const onCounter = jest.fn();
    renderCard(offer, onCounter);

    await user.click(screen.getByRole('button', { name: 'پیشنهاد متقابل' }));

    expect(onCounter).toHaveBeenCalledWith(offer);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('renders the rejected state dimmed with the status chip and the note', () => {
    const { container } = renderCard(
      offerFixture({
        myRole: 'seller',
        status: 'REJECTED',
        note: 'موجودی تمام شده',
      }),
    );

    expect(container.firstElementChild).toHaveClass('opacity-60');
    expect(screen.getByText('رد شده')).toBeInTheDocument();
    expect(screen.getByText(/یادداشت: موجودی تمام شده/)).toBeInTheDocument();
  });

  it('renders the PENDING deadline as an absolute Jalali date, not relative time', () => {
    const offer = offerFixture({ myRole: 'seller', status: 'PENDING' });
    renderCard(offer);

    // formatRelativeTimeFa is past-oriented — a live future deadline must never
    // read «چند لحظه پیش»; the card shows the absolute Jalali date instead
    // (computed here with the same Intl options as lib/format's formatJalali).
    const expected = new Intl.DateTimeFormat('fa-IR', { calendar: 'persian' }).format(
      new Date(offer.expiresAt),
    );
    expect(screen.getByText(new RegExp(`مهلت پاسخ: ${expected}`))).toBeInTheDocument();
    expect(screen.queryByText(/مهلت پاسخ: چند لحظه پیش/)).not.toBeInTheDocument();
  });
});
