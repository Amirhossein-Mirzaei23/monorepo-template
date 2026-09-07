import { render, screen } from '@testing-library/react';
import type { PublicSellerListDto } from '@monorepo/shared-types';
import { cardPageFixture, CATEGORY_TREE_FIXTURE } from '../testing/fixtures';
import { CategoryTiles } from '../components/category-tiles';
import {
  EmptySection,
  HomeLotGrid,
  HomeSection,
  SectionErrorCard,
  SellersStrip,
} from '../components/home-sections';

/**
 * MKT-004 component tests — the home section building blocks: the section
 * shell with its «مشاهده همه» link, the lot grid and its empty state, the
 * sellers strip (badge per item, hidden entirely when the verified=true call
 * returns nothing), the per-section error card with its reload-retry link and
 * the category tiles.
 */
describe('HomeSection', () => {
  it('renders the heading and the «مشاهده همه» link to the listing page', () => {
    render(
      <HomeSection title="تازه‌ها" viewAllHref="/lots">
        <p>محتوا</p>
      </HomeSection>,
    );
    expect(screen.getByRole('heading', { name: 'تازه‌ها' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'مشاهده همه' })).toHaveAttribute('href', '/lots');
  });

  it('omits the view-all link for sections without a listing page', () => {
    render(
      <HomeSection title="تأییدشده‌ها">
        <p>محتوا</p>
      </HomeSection>,
    );
    expect(screen.queryByRole('link', { name: 'مشاهده همه' })).not.toBeInTheDocument();
  });
});

describe('HomeLotGrid', () => {
  it('renders one LotCard per page item', () => {
    render(<HomeLotGrid page={cardPageFixture(1, ['a1', 'a2'], 8, 8)} emptyTitle="خالی" />);
    expect(screen.getByRole('link', { name: /لات a1/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /لات a2/ })).toBeInTheDocument();
    expect(screen.queryByText('خالی')).not.toBeInTheDocument();
  });

  it('renders the tasteful empty state when the section has no data', () => {
    render(
      <HomeLotGrid
        page={{ items: [], total: 0, page: 1, limit: 8 }}
        emptyTitle="هنوز لاتی ثبت نشده"
        emptyHint="اولین لات‌ها به‌زودی همین‌جا نمایش داده می‌شوند."
      />,
    );
    expect(screen.getByText('هنوز لاتی ثبت نشده')).toBeInTheDocument();
    expect(
      screen.getByText('اولین لات‌ها به‌زودی همین‌جا نمایش داده می‌شوند.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('home-lot-grid')).not.toBeInTheDocument();
  });
});

describe('SellersStrip', () => {
  const sellers: PublicSellerListDto = {
    items: [
      {
        id: 's1',
        displayName: 'مینا رضایی',
        businessName: 'تولیدی پوشاک مینا',
        province: 'isfahan',
        city: 'kashan',
        verified: false,
      },
      {
        id: 's2',
        displayName: 'آرمان تهرانی',
        businessName: null,
        province: 'tehran',
        city: 'tehran',
        verified: true,
      },
    ],
  };

  it('renders seller cards with the business-name precedence and the fa city label', () => {
    render(<SellersStrip sellers={sellers} />);
    const strip = screen.getByRole('list', { name: 'فروشندگان تأییدشده' });
    expect(strip).toBeInTheDocument();
    expect(screen.getByText('تولیدی پوشاک مینا')).toBeInTheDocument();
    // businessName === null falls back to displayName:
    expect(screen.getByText('آرمان تهرانی')).toBeInTheDocument();
    expect(screen.getByText('کاشان')).toBeInTheDocument();
    // verified placeholder (false) → badge hidden; true → badge shown:
    expect(screen.getAllByText('تأییدشده')).toHaveLength(1);
  });

  it('renders NOTHING when the verified=true call returned no sellers (hidden, not empty-state)', () => {
    const { container } = render(<SellersStrip sellers={{ items: [] }} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('SectionErrorCard', () => {
  it('announces the failure with a «تلاش دوباره» reload link', () => {
    render(<SectionErrorCard />);
    expect(screen.getByRole('alert')).toHaveTextContent('این بخش موقتاً در دسترس نیست');
    expect(screen.getByRole('link', { name: 'تلاش دوباره' })).toHaveAttribute('href', '/');
  });
});

describe('CategoryTiles', () => {
  it('renders top-level category tiles linking to the /c/{slug} landings', () => {
    render(<CategoryTiles categories={CATEGORY_TREE_FIXTURE} />);
    const apparel = screen.getByRole('link', { name: /پوشاک/ });
    expect(apparel).toHaveAttribute('href', '/c/apparel');
    expect(screen.getByRole('link', { name: /خانه و آشپزخانه/ })).toHaveAttribute(
      'href',
      '/c/home-kitchen',
    );
  });

  it('falls back to an empty state when the tree has no active categories', () => {
    render(<CategoryTiles categories={[]} />);
    expect(screen.getByText('دسته‌ای یافت نشد')).toBeInTheDocument();
  });
});

describe('EmptySection', () => {
  it('renders icon, title and hint copy', () => {
    render(<EmptySection icon="store" title="فروشنده‌ای نیست" hint="به‌زودی." />);
    expect(screen.getByText('فروشنده‌ای نیست')).toBeInTheDocument();
    expect(screen.getByText('به‌زودی.')).toBeInTheDocument();
  });
});
