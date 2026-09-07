import { render, screen } from '@testing-library/react';
import { sellerProfileFixture } from '@/features/profile';

/**
 * PROF-002 page render test — the RSC is invoked as an async function. The
 * origin fetch is mocked at the global.fetch seam (NOT with jest.mock on a
 * relative path: parens in the `(public)` route-group directory break jest's
 * module resolution — see the /l/{code} page suite). Bonus: the real fetcher
 * runs, so the fixture must satisfy the recomposed zod contract
 * (parseApiResponse) — contract drift fails here. next/navigation's
 * notFound() is mocked to throw a sentinel so the 404 path is observable.
 */
const mockNotFound = jest.fn(() => {
  throw new Error('NEXT_HTTP_ERROR_FALLBACK;404');
});

jest.mock('next/navigation', () => ({
  notFound: (...args: unknown[]) => mockNotFound(...(args as [])),
}));

const fetchMock = jest.fn();

function jsonResponse(
  body: unknown,
  status = 200,
): {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
} {
  return { ok: status < 400, status, json: async () => body };
}

const SELLER = sellerProfileFixture();
const SELLER_ID = SELLER.id;

function stubOrigin(overrides: { status?: number; body?: () => unknown } = {}): void {
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith(`/profiles/sellers/${SELLER_ID}`)) {
      const body = overrides.body ? overrides.body() : SELLER;
      return jsonResponse(body, overrides.status ?? 200);
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  mockNotFound.mockClear();
  global.fetch = fetchMock as unknown as typeof global.fetch;
  stubOrigin();
});

const pageParams = (id: string): { params: Promise<{ id: string }> } => ({
  params: Promise.resolve({ id }),
});

describe('SellerProfilePage (PROF-002)', () => {
  it('fetches the profile id from the API origin and renders the full page', async () => {
    const SellerProfilePage = (await import('../page')).default;
    const { container } = render(await SellerProfilePage(pageParams(SELLER_ID)));

    // Origin hop, no-store (never the BFF path — RSC has no relative base).
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain(`/profiles/sellers/${SELLER_ID}`);

    expect(
      screen.getByRole('heading', { level: 1, name: 'تولیدی پوشاک مینا' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'لات‌های فعال' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'فروش‌های موفق' })).toBeInTheDocument();
    expect(screen.getByTestId('active-lot-grid').children).toHaveLength(3);
    expect(screen.getByTestId('sold-lot-grid').children).toHaveLength(2);
    expect(screen.getByText('کاشان، اصفهان')).toBeInTheDocument();
    expect(container.querySelector('main')).not.toBeNull();
  });

  it('calls notFound() when the API answers 404 (unknown/non-seller/inactive — uniform)', async () => {
    stubOrigin({ status: 404, body: () => ({ message: 'Seller not found' }) });
    const SellerProfilePage = (await import('../page')).default;

    await expect(SellerProfilePage(pageParams(SELLER_ID))).rejects.toThrow(
      'NEXT_HTTP_ERROR_FALLBACK;404',
    );
    expect(mockNotFound).toHaveBeenCalledTimes(1);
  });

  it('exposes basic OG metadata: business name + fa city', async () => {
    const { generateMetadata } = await import('../page');
    const metadata = await generateMetadata(pageParams(SELLER_ID));

    expect(metadata.title).toBe('تولیدی پوشاک مینا');
    expect(metadata.description).toBe('کاشان، اصفهان');
    expect(metadata.openGraph?.title).toBe('تولیدی پوشاک مینا');
  });

  it('falls back to «فروشنده یافت نشد» metadata when the fetch fails outright', async () => {
    stubOrigin({
      body: () => {
        throw new Error('api down');
      },
    });
    const { generateMetadata } = await import('../page');
    const metadata = await generateMetadata(pageParams(SELLER_ID));

    expect(metadata.title).toBe('فروشنده یافت نشد');
    expect(metadata.openGraph).toBeUndefined();
  });
});
