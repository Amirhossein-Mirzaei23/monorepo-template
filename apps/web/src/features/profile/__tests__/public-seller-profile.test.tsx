import { render, screen } from '@testing-library/react';
import { ToastProvider } from '@/components/ui/toast';
import { PublicSellerProfileView } from '../components/public-seller-profile';
import { sellerProfileFixture } from '../testing/fixtures';

/**
 * PROF-002 view tests — the server-rendered public seller profile surface:
 * header precedence (businessName ?? displayName), fa city + Jalali member
 * since, TRS placeholders hidden (verified badge + badge row), category
 * chips, public bio, metrics placeholders (zeros + «—»), both lot grids and
 * both empty states.
 */
function renderView(overrides = {}) {
  return render(
    <ToastProvider>
      <PublicSellerProfileView seller={sellerProfileFixture(overrides)} />
    </ToastProvider>,
  );
}

describe('PublicSellerProfileView (PROF-002)', () => {
  it('renders the header with businessName precedence, fa city and membership date', () => {
    renderView();

    expect(
      screen.getByRole('heading', { level: 1, name: 'تولیدی پوشاک مینا' }),
    ).toBeInTheDocument();
    expect(screen.getByText('کاشان، اصفهان')).toBeInTheDocument();
    expect(screen.getByText(/عضو از/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'هم‌رسانی پروفایل فروشنده' })).toBeInTheDocument();
  });

  it('falls back to displayName when no businessName is set', () => {
    renderView({ businessName: null });
    expect(screen.getByRole('heading', { level: 1, name: 'مینا رضایی' })).toBeInTheDocument();
  });

  it('keeps the TRS placeholders invisible (no verified badge, no badge row)', () => {
    renderView({ verified: false, badges: [] });

    expect(screen.queryByRole('list', { name: 'نشان‌ها' })).not.toBeInTheDocument();
    expect(screen.queryByText('تأییدشده')).not.toBeInTheDocument();
  });

  it('renders the public bio, category chips and the trust metrics strip', () => {
    renderView();

    expect(screen.getByRole('region', { name: 'درباره فروشنده' })).toHaveTextContent(
      'عمده‌فروشی پوشاک',
    );
    expect(screen.getByRole('list', { name: 'دسته‌بندی‌ها' })).toHaveTextContent('پوشاک');
    const metrics = screen.getByRole('region', { name: 'شاخص‌های اعتماد' });
    expect(metrics).toHaveTextContent('معاملات موفق');
    // PROF-005 placeholders: nullable metrics render «—», the footnote explains.
    expect(screen.getAllByText('—')).toHaveLength(2);
    expect(metrics).toHaveTextContent('این شاخص‌ها پس از نخستین معاملات و نظرات فعال می‌شوند.');
  });

  it('renders both lot grids: active first, sold as «فروش‌های موفق»', () => {
    renderView();

    expect(screen.getByRole('region', { name: 'لات‌های فعال' })).toBeInTheDocument();
    expect(screen.getByTestId('active-lot-grid').children).toHaveLength(3);
    expect(screen.getByRole('region', { name: 'فروش‌های موفق' })).toBeInTheDocument();
    expect(screen.getByTestId('sold-lot-grid').children).toHaveLength(2);
    expect(screen.getByText('لات فعال فروشنده 1')).toBeInTheDocument();
    expect(screen.getByText('لات فروخته‌شده 1').closest('section')).toHaveAttribute(
      'aria-label',
      'فروش‌های موفق',
    );
  });

  it('renders the dedicated empty state for each grid when the seller has no lots', () => {
    renderView({
      categories: [],
      bio: null,
      activeLots: { items: [], total: 0, page: 1, limit: 12 },
      soldLots: { items: [], total: 0, page: 1, limit: 4 },
    });

    expect(screen.getByText('این فروشنده هنوز لات فعالی ندارد')).toBeInTheDocument();
    expect(screen.getByText('هنوز فروش موفقی ثبت نشده است')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'دسته‌بندی‌ها' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'درباره فروشنده' })).not.toBeInTheDocument();
  });
});
