import { render, screen } from '@testing-library/react';
import type { LotPublicDetailResponseDto } from '@monorepo/shared-types';
import { lotDetailFixture } from '@/features/marketplace';

/**
 * MKT-009 page render test — the RSC is invoked as an async function. The
 * origin fetch is mocked at the global.fetch seam (NOT with jest.mock on a
 * relative path: parens in the `(public)` route-group directory break jest's
 * module resolution — see the home-page suite). Bonus: the real fetcher runs,
 * so the fixture must satisfy the generated zod contract (parseApiResponse) —
 * contract drift fails here. next/navigation's notFound() is mocked to throw
 * a sentinel so the 404 path is observable.
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

const LOT: LotPublicDetailResponseDto = lotDetailFixture();

function stubOrigin(overrides: { status?: number; body?: () => unknown } = {}): void {
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/lots/7Kd2Qm9x')) {
      const body = overrides.body ? overrides.body() : LOT;
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

const pageParams = (code: string): { params: Promise<{ code: string }> } => ({
  params: Promise.resolve({ code }),
});

describe('LotDetailPage (MKT-009)', () => {
  it('fetches by code from the API origin and renders the full detail surface', async () => {
    const LotDetailPage = (await import('../page')).default;
    const { container } = render(await LotDetailPage(pageParams('7Kd2Qm9x')));

    // Origin hop, no-store (never the BFF path — RSC has no relative base).
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain('/lots/7Kd2Qm9x');

    expect(screen.getByRole('heading', { level: 1, name: LOT.title })).toBeInTheDocument();
    expect(screen.getByText('تهران — بازار بزرگ تهران')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'لات‌های مشابه' })).toBeInTheDocument();
    expect(container.querySelector('video')).not.toBeNull();
  });

  it('calls notFound() when the API answers 404 (unknown or non-public code)', async () => {
    stubOrigin({ status: 404, body: () => ({ message: 'Lot not found' }) });
    const LotDetailPage = (await import('../page')).default;

    await expect(LotDetailPage(pageParams('7Kd2Qm9x'))).rejects.toThrow(
      'NEXT_HTTP_ERROR_FALLBACK;404',
    );
    expect(mockNotFound).toHaveBeenCalledTimes(1);
  });

  it('exposes basic OG metadata: fa title, price + city description, cover image', async () => {
    const { generateMetadata } = await import('../page');
    const metadata = await generateMetadata(pageParams('7Kd2Qm9x'));

    expect(metadata.title).toBe('عمده پیراهن مردانه — ۵۰ عدد');
    expect(metadata.description).toContain('۱۱۲٬۵۰۰٬۰۰۰ تومان');
    expect(metadata.description).toContain('تهران');
    expect(metadata.openGraph?.title).toBe(LOT.title);
    expect(metadata.openGraph).toHaveProperty('images', [
      { url: 'http://media.test/2026/09/cover.jpg' },
    ]);
  });

  it('falls back to «لات یافت نشد» metadata when the fetch fails outright', async () => {
    stubOrigin({
      body: () => {
        throw new Error('api down');
      },
    });
    const { generateMetadata } = await import('../page');
    const metadata = await generateMetadata(pageParams('7Kd2Qm9x'));

    expect(metadata.title).toBe('لات یافت نشد');
    expect(metadata.openGraph).toBeUndefined();
  });
});
