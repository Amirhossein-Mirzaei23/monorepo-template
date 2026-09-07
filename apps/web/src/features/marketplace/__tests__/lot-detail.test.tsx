import { render, screen } from '@testing-library/react';
import { LotDetail } from '../components/lot-detail';
import { lotDetailFixture } from '../testing/fixtures';

/**
 * MKT-009 detail-surface tests: header (title, location «شهر — منطقه», price
 * hierarchy), the spec block's fa label rows (unit/condition/reason/pricing/
 * category path/expiry), description, seller summary, the similar-lots grid,
 * and the disabled-first CTA contract (chat/offer/save/share disabled with
 * «به‌زودی», report button ABSENT until TRS-004).
 */

const NOW = new Date('2026-09-05T12:00:00.000Z');

describe('LotDetail — header', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW.getTime());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders title, price hierarchy and the «{city} — {locationHint}» location line', () => {
    render(<LotDetail lot={lotDetailFixture()} />);

    const lot = lotDetailFixture();
    expect(screen.getByRole('heading', { level: 1, name: lot.title })).toBeInTheDocument();
    // Full digits on detail (ui-patterns.md); both price lines repeat inside
    // similar cards, hence getAllByText.
    expect(screen.getAllByText('۱۱۲٬۵۰۰٬۰۰۰ تومان').length).toBeGreaterThan(0);
    expect(screen.getAllByText('هر واحد ~۲٬۲۵۰٬۰۰۰ تومان').length).toBeGreaterThan(0);
    // fa city label + the public area hint — and nothing more precise.
    expect(screen.getByText('تهران — بازار بزرگ تهران')).toBeInTheDocument();
    expect(screen.queryByText(/خیابان/)).not.toBeInTheDocument();
  });

  it('renders the bare fa city when the lot has no locationHint', () => {
    render(<LotDetail lot={lotDetailFixture({ locationHint: null })} />);

    expect(screen.getAllByText('تهران').length).toBeGreaterThan(0);
  });
});

describe('LotDetail — spec block (fa display maps)', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW.getTime());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders every labeled spec row with fa values', () => {
    render(<LotDetail lot={lotDetailFixture()} />);

    // Values like «۵۰ عدد» / «درجه A» also appear inside similar cards, so the
    // spec rows assert on their own <dl> (the terms are unique page-wide).
    const specBlock = screen.getByText('وضعیت کالا').closest('dl') as HTMLDListElement;
    const specText = specBlock.textContent ?? '';
    expect(screen.getByText('تعداد')).toBeInTheDocument();
    expect(specText).toContain('۵۰ عدد');
    expect(screen.getByText('موجودی')).toBeInTheDocument();
    expect(specText).toContain('۴۵ عدد');
    expect(screen.getByText('حداقل سفارش')).toBeInTheDocument();
    expect(specText).toContain('۱۰ عدد');
    expect(screen.getByText('وضعیت کالا')).toBeInTheDocument();
    expect(specText).toContain('درجه A');
    expect(screen.getByText('دلیل فروش')).toBeInTheDocument();
    expect(specText).toContain('انباشت موجودی');
    expect(screen.getByText('نوع قیمت')).toBeInTheDocument();
    expect(specText).toContain('قیمت ثابت');
    expect(screen.getByText('دسته‌بندی')).toBeInTheDocument();
    expect(specText).toContain('پوشاک ← مردانه');
    expect(screen.getByText('مهلت فروش')).toBeInTheDocument();
    // Jalali expiry (1405-era) rendered from the ISO payload date.
    expect(specText).toMatch(/۱۴۰/);
  });

  it('renders the top-level category alone when there is no subcategory', () => {
    render(<LotDetail lot={lotDetailFixture({ subcategory: null })} />);

    expect(screen.getByText('پوشاک')).toBeInTheDocument();
  });

  it('renders the description section with preserved line breaks', () => {
    render(<LotDetail lot={lotDetailFixture()} />);

    expect(screen.getByRole('region', { name: 'توضیحات' })).toHaveTextContent(
      'پیراهن‌های درجه A در کارتن‌های ۱۰ عددی',
    );
  });
});

describe('LotDetail — seller summary', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW.getTime());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the business name, fa city and no verified badge while verified=false', () => {
    render(<LotDetail lot={lotDetailFixture()} />);

    const seller = screen.getByRole('region', { name: 'فروشنده' });
    expect(seller).toHaveTextContent('تولیدی پوشاک مینا');
    expect(seller).toHaveTextContent('تهران');
    expect(screen.queryByText('تأییدشده')).not.toBeInTheDocument();
  });

  it('falls back to the person name and a generic line without profile data', () => {
    const lot = lotDetailFixture({
      seller: { id: 's1', name: 'مینا رضایی', businessName: null, city: null, verified: false },
    });
    render(<LotDetail lot={lot} />);

    const seller = screen.getByRole('region', { name: 'فروشنده' });
    expect(seller).toHaveTextContent('مینا رضایی');
    expect(seller).toHaveTextContent('فروشنده راکدشو');
  });

  it('shows the verified badge when the API reports a verified seller (TRS-002 slot)', () => {
    const lot = lotDetailFixture({
      seller: { ...lotDetailFixture().seller, verified: true },
    });
    render(<LotDetail lot={lot} />);

    expect(screen.getByText('تأییدشده')).toBeInTheDocument();
  });
});

describe('LotDetail — similar lots', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW.getTime());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the similar grid as cards linking to /l/{code}', () => {
    render(<LotDetail lot={lotDetailFixture()} />);

    expect(screen.getByRole('region', { name: 'لات‌های مشابه' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /لات مشابه یک/ })).toHaveAttribute(
      'href',
      '/l/SimLot01',
    );
    expect(screen.getByRole('link', { name: /لات مشابه دو/ })).toHaveAttribute(
      'href',
      '/l/SimLot02',
    );
  });

  it('renders no similar section when the payload is empty', () => {
    render(<LotDetail lot={lotDetailFixture({ similar: [] })} />);

    expect(screen.queryByRole('region', { name: 'لات‌های مشابه' })).not.toBeInTheDocument();
  });
});

describe('LotDetail — CTA contract (disabled-first, MKT-009)', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW.getTime());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders chat/offer/save/share DISABLED with the «به‌زودی» tooltip', () => {
    render(<LotDetail lot={lotDetailFixture()} />);

    // The actions render on BOTH surfaces (sticky mobile bar + desktop row).
    const chat = screen.getAllByRole('button', { name: /گفتگو با فروشنده/ });
    const offer = screen.getAllByRole('button', { name: /پیشنهاد قیمت/ });
    const save = screen.getAllByRole('button', { name: /ذخیره/ });
    const share = screen.getAllByRole('button', { name: /هم‌رسانی/ });
    for (const group of [chat, offer, save, share]) {
      expect(group.length).toBeGreaterThanOrEqual(1);
      for (const button of group) {
        expect(button).toBeDisabled();
        expect(button).toHaveAttribute('title', 'به‌زودی');
      }
    }
  });

  it('renders NO report button (feature-flagged until TRS-004)', () => {
    render(<LotDetail lot={lotDetailFixture()} />);

    expect(screen.queryByRole('button', { name: /گزارش/ })).not.toBeInTheDocument();
  });
});
