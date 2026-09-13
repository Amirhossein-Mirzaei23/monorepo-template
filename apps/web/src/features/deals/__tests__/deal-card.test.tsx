import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';

jest.mock('../../../providers/auth-provider', () => ({
  useAuth: () => ({ accessToken: () => 'test-access-token' }),
}));

import { ToastProvider } from '@/components/ui/toast';
import { DealCard } from '../components/deal-card';
import { dealFixture } from '../testing/fixtures';

/**
 * DEAL-004 card tests: the lot link + status chip, the toman headline, the
 * terms meta line, and the terminal-state dimming — cache-free (the card is
 * a pure render of the payload).
 */

function renderCard(overrides?: Parameters<typeof dealFixture>[0]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <DealCard deal={dealFixture(overrides)} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('DealCard', () => {
  it('renders the lot link, the status chip, the headline price and the meta line', () => {
    renderCard();

    const card = screen.getByTestId('deal-card');
    const link = within(card).getByRole('link');
    expect(link).toHaveAttribute('href', '/deals/9Xk2Qm7b');
    expect(within(link).getByText(/عمده پیراهن مردانه/)).toBeInTheDocument();
    expect(within(card).getByText('در مذاکره')).toBeInTheDocument();
    expect(within(card).getAllByText('۳٬۰۰۰٬۰۰۰ تومان').length).toBeGreaterThan(0);
    expect(within(card).getByText(/تعداد ۱۰/)).toBeInTheDocument();
  });

  it('dims terminal deals but keeps them visible', () => {
    renderCard({ status: 'CANCELLED' });
    expect(screen.getByTestId('deal-card').className).toContain('opacity-60');
    expect(screen.getByText('لغو شده')).toBeInTheDocument();
  });
});
