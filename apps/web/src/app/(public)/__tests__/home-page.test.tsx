import { render, screen } from '@testing-library/react';
import type {
  CategoryTreeNodeDto,
  LotCardResponseDto,
  PublicSellerListDto,
} from '@monorepo/shared-types';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
}));

/**
 * MKT-004 page render test — the RSC home is invoked as an async function.
 * The four server fetches are mocked at the global.fetch seam (NOT with
 * jest.mock on the feature barrel: jest cannot resolve mock paths from a
 * spec inside the `(public)` route-group directory — parens break its module
 * resolution). Bonus: the real fetchers run, so every fixture must satisfy
 * the generated zod contract (parseApiResponse) — contract drift fails here.
 */
const fetchMock = jest.fn();

function jsonResponse(body: unknown): {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
} {
  return { ok: true, status: 200, json: async () => body };
}

const lotFixture = (id: string): LotCardResponseDto => ({
  id,
  code: `code${id}`,
  title: `لات ${id}`,
  unitPrice: 2_250_000,
  totalPrice: 112_500_000,
  quantity: 50,
  availableQuantity: 50,
  unit: 'PIECE',
  condition: 'GRADE_A',
  city: 'tehran',
  province: 'tehran',
  coverThumbUrl: null,
  seller: { id: 'seller-1', name: 'مینا رضایی', businessName: 'تولیدی پوشاک مینا' },
  verifiedSeller: false,
  updatedAt: '2026-09-05T09:00:00.000Z',
  createdAt: '2026-09-01T12:00:00.000Z',
  expiresAt: '2026-10-05T12:00:00.000Z',
});

const lotPage = (ids: string[]) => ({
  items: ids.map(lotFixture),
  total: ids.length,
  page: 1,
  limit: 8,
});

const TREE: CategoryTreeNodeDto[] = [
  { id: 'cat-apparel', nameFa: 'پوشاک', nameEn: null, slug: 'apparel', children: [] },
];

const SELLERS: PublicSellerListDto = {
  items: [
    {
      id: 's1',
      displayName: 'مینا رضایی',
      businessName: 'تولیدی پوشاک مینا',
      province: 'isfahan',
      city: 'kashan',
      verified: false,
    },
  ],
};

/** Routes an origin URL to its fake payload; overridable per test. */
function stubOrigin(
  overrides: {
    categories?: () => unknown;
    fresh?: () => unknown;
    ending?: () => unknown;
    sellers?: () => unknown;
  } = {},
): void {
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/categories')) {
      return jsonResponse(overrides.categories ? overrides.categories() : TREE);
    }
    if (url.includes('/profiles/sellers')) {
      return jsonResponse(overrides.sellers ? overrides.sellers() : { items: [] });
    }
    if (url.includes('/lots')) {
      if (url.includes('sort=expiresAt')) {
        return jsonResponse(overrides.ending ? overrides.ending() : lotPage(['e1', 'e2']));
      }
      return jsonResponse(overrides.fresh ? overrides.fresh() : lotPage(['f1', 'f2']));
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof global.fetch;
  stubOrigin();
});

describe('PublicHomePage (MKT-004)', () => {
  it('exposes the fa SEO metadata', async () => {
    const { metadata } = await import('../page');
    expect(metadata.title).toEqual({ absolute: 'راکدشو — بازارگاه عمده کالای راکد' });
    expect(metadata.description).toContain('کالای راکد');
  });

  it('renders the hero search bar and every populated section from the parallel fetch', async () => {
    const PublicHomePage = (await import('../page')).default;
    render(await PublicHomePage());

    // Hero: heading + the MKT-007 search bar (role=search).
    expect(screen.getByRole('heading', { name: 'بازارگاه عمده کالای راکد' })).toBeInTheDocument();
    expect(screen.getByRole('search')).toBeInTheDocument();

    // Categories + both lot sections render real cards («پوشاک» matches the
    // tile AND lot-card seller names — pick the tile by its href):
    const categoryTile = screen
      .getAllByRole('link', { name: /پوشاک/ })
      .find((link) => link.getAttribute('href') === '/c/apparel');
    expect(categoryTile).toBeDefined();
    expect(screen.getByRole('link', { name: /لات f1/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /لات e1/ })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'مشاهده همه' })).toHaveLength(2);
    // DOM order: «تازه‌ها» section first, «به‌زودی تمام می‌شوند» second.
    const viewAllHrefs = screen
      .getAllByRole('link', { name: 'مشاهده همه' })
      .map((link) => link.getAttribute('href'));
    expect(viewAllHrefs).toEqual(['/lots', '/lots?sort=expiresAt']);

    // Fixed home slices: 8 lots per section, verified-only sellers, 10 max.
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls).toContainEqual(expect.stringContaining('/lots?sort=createdAt&page=1&limit=8'));
    expect(urls).toContainEqual(expect.stringContaining('/lots?sort=expiresAt&page=1&limit=8'));
    expect(urls).toContainEqual(
      expect.stringContaining('/profiles/sellers?verified=true&limit=10'),
    );
  });

  it('keeps the other sections up when ONE section fails (per-section error card)', async () => {
    stubOrigin({
      fresh: () => {
        throw new Error('fresh down');
      },
    });
    const PublicHomePage = (await import('../page')).default;
    render(await PublicHomePage());

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('این بخش موقتاً در دسترس نیست');
    expect(screen.getByRole('link', { name: 'تلاش دوباره' })).toHaveAttribute('href', '/');
    // The failing section's slot shows the card; the others still render:
    expect(screen.getByRole('link', { name: /لات e1/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /لات f/ })).not.toBeInTheDocument();
  });

  it('shows the section empty state when the API returns no lots', async () => {
    stubOrigin({ fresh: () => lotPage([]), ending: () => lotPage([]) });
    const PublicHomePage = (await import('../page')).default;
    render(await PublicHomePage());

    expect(screen.getByText('هنوز لاتی ثبت نشده')).toBeInTheDocument();
    expect(screen.getByText('لاتی در آستانه پایان نیست')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('hides the «تأییدشده‌ها» strip while no verified seller exists (TRS-001 placeholder)', async () => {
    const PublicHomePage = (await import('../page')).default;
    render(await PublicHomePage());

    expect(screen.queryByRole('heading', { name: 'تأییدشده‌ها' })).not.toBeInTheDocument();
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes('/profiles/sellers?verified=true&limit=10'))).toBe(true);
  });

  it('renders the «تأییدشده‌ها» strip when the verified call returns sellers', async () => {
    stubOrigin({ sellers: () => SELLERS });
    const PublicHomePage = (await import('../page')).default;
    render(await PublicHomePage());

    expect(screen.getByRole('heading', { name: 'تأییدشده‌ها' })).toBeInTheDocument();
    // «تولیدی پوشاک مینا» also appears inside lot-card seller footers — the
    // strip is proven by the fa city label only the strip resolves:
    expect(screen.getAllByText('تولیدی پوشاک مینا').length).toBeGreaterThan(0);
    expect(screen.getByText('کاشان')).toBeInTheDocument();
  });
});
