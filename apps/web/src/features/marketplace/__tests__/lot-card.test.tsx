import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LotCardResponseDto } from '@monorepo/shared-types';
import { LotCard, LotCardSkeleton } from '../components/lot-card';

/**
 * MKT-005 component tests: full field rendering (prices via formatToman, fa
 * quantity+unit, condition chip, seller precedence, relative time), save-heart
 * gating, cover fallback (missing + broken), grid/list variants and the a11y
 * contract (card = one link, heart = separate button outside it).
 */

const NOW = new Date('2026-09-05T12:00:00.000Z');

const baseLot: LotCardResponseDto = {
  id: 'clxcard0001',
  code: '7Kd2Qm9x',
  title: 'عمده پیراهن مردانه — ۵۰ عدد',
  unitPrice: 2_250_000,
  totalPrice: 112_500_000,
  quantity: 50,
  availableQuantity: 50,
  unit: 'PIECE',
  condition: 'GRADE_A',
  city: 'tehran',
  province: 'tehran',
  coverThumbUrl: null,
  seller: { id: 'clxseller01', name: 'مینا رضایی', businessName: 'تولیدی پوشاک مینا' },
  verifiedSeller: false,
  updatedAt: '2026-09-05T09:00:00.000Z', // 3h before NOW → «۳ ساعت پیش»
  createdAt: '2026-09-01T12:00:00.000Z',
  expiresAt: '2026-10-05T12:00:00.000Z',
};

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW.getTime());
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('LotCard — rendering', () => {
  it('renders every card field', () => {
    render(<LotCard lot={baseLot} />);

    expect(screen.getByRole('heading', { name: baseLot.title })).toBeInTheDocument();
    // Total + unit price hierarchy via formatToman.
    expect(screen.getByText('۱۱۲٬۵۰۰٬۰۰۰ تومان')).toBeInTheDocument();
    expect(screen.getByText('هر واحد ~۲٬۲۵۰٬۰۰۰ تومان')).toBeInTheDocument();
    // fa quantity + unit label chip.
    expect(screen.getByText('۵۰ عدد')).toBeInTheDocument();
    // Condition chip (fa label from the shared map).
    expect(screen.getByText('درجه A')).toBeInTheDocument();
    // City slug resolved to its fa name.
    expect(screen.getByText('تهران')).toBeInTheDocument();
    // Seller display precedence: businessName ?? name.
    expect(screen.getByText('تولیدی پوشاک مینا')).toBeInTheDocument();
    // Relative updatedAt.
    expect(screen.getByText('۳ ساعت پیش')).toBeInTheDocument();
  });

  it('falls back to the seller name when no business name is set', () => {
    render(<LotCard lot={{ ...baseLot, seller: { ...baseLot.seller, businessName: null } }} />);
    expect(screen.getByText('مینا رضایی')).toBeInTheDocument();
  });

  it('hides the verified badge while the API sends verifiedSeller: false', () => {
    render(<LotCard lot={baseLot} />);
    expect(screen.queryByText('تأییدشده')).not.toBeInTheDocument();
  });

  it('renders the verified badge for a verified seller (TRS-002 render slot)', () => {
    render(<LotCard lot={{ ...baseLot, verifiedSeller: true }} />);
    expect(screen.getByText('تأییدشده')).toBeInTheDocument();
  });
});

describe('LotCard — link + a11y contract', () => {
  it('is one link to /l/{code} wrapping the image and title', () => {
    render(<LotCard lot={{ ...baseLot, coverThumbUrl: 'http://media.test/cover.webp' }} />);

    const link = screen.getByRole('link', { name: new RegExp(baseLot.title) });
    expect(link).toHaveAttribute('href', '/l/7Kd2Qm9x');
    expect(link.contains(screen.getByRole('img', { name: baseLot.title }))).toBe(true);
  });

  it('keeps the save heart outside the link with aria-pressed + «ذخیره» label', async () => {
    const onToggleSave = jest.fn();
    render(<LotCard lot={baseLot} saveable saved onToggleSave={onToggleSave} />);

    const heart = screen.getByRole('button', { name: 'ذخیره' });
    const link = screen.getByRole('link', { name: new RegExp(baseLot.title) });
    // Separate button — not a nested interactive element inside the link.
    expect(link.contains(heart)).toBe(false);
    expect(heart).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(heart);
    expect(onToggleSave).toHaveBeenCalledTimes(1);
  });

  it('renders the heart as unsaved (aria-pressed=false) by default', () => {
    render(<LotCard lot={baseLot} saveable onToggleSave={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'ذخیره' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders no heart by default (saveable=false until SAV-001)', () => {
    render(<LotCard lot={baseLot} />);
    expect(screen.queryByRole('button', { name: 'ذخیره' })).not.toBeInTheDocument();
  });
});

describe('LotCard — cover fallback', () => {
  it('shows the placeholder tile when the lot has no cover', () => {
    render(<LotCard lot={baseLot} />);

    expect(screen.queryByRole('img', { name: baseLot.title })).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'تصویری برای این لات موجود نیست' })).toBeInTheDocument();
  });

  it('lazy-loads the cover thumb when present', () => {
    render(<LotCard lot={{ ...baseLot, coverThumbUrl: 'http://media.test/cover.webp' }} />);

    const img = screen.getByRole('img', { name: baseLot.title });
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('src', 'http://media.test/cover.webp');
  });

  it('swaps to the placeholder when the cover image fails to load', () => {
    render(<LotCard lot={{ ...baseLot, coverThumbUrl: 'http://media.test/cover.webp' }} />);

    fireEvent.error(screen.getByRole('img', { name: baseLot.title }));

    expect(screen.queryByRole('img', { name: baseLot.title })).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'تصویری برای این لات موجود نیست' })).toBeInTheDocument();
  });
});

describe('LotCard — variants + skeleton', () => {
  it('renders the grid variant as a vertical tile (default)', () => {
    const { container } = render(<LotCard lot={baseLot} />);
    expect(screen.getByRole('link')).toHaveClass('flex-col');
    expect(screen.getByRole('link')).not.toHaveClass('flex-row');
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders the list variant as a horizontal row', () => {
    render(<LotCard lot={baseLot} variant="list" />);
    expect(screen.getByRole('link')).toHaveClass('flex-row');
    expect(screen.getByRole('link')).not.toHaveClass('flex-col');
  });

  it('renders the skeleton matching the requested variant', () => {
    const { container } = render(<LotCardSkeleton variant="list" />);
    const skeleton = container.firstElementChild;
    expect(skeleton).toHaveAttribute('aria-hidden', 'true');
    expect(skeleton?.firstElementChild).toHaveClass('flex-row');
  });
});
