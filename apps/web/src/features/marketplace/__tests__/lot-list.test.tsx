import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockParams = { current: new URLSearchParams() };

jest.mock('next/navigation', () => ({
  useSearchParams: () => mockParams.current,
}));

import type { LotCardResponseDto, Paginated } from '@monorepo/shared-types';
import { LotList } from '../components/lot-list';
import { LOT_LIST_PAGE_SIZE } from '../schemas/browse-query';
import { CATEGORY_TREE_FIXTURE, cardPageFixture } from '../testing/fixtures';

/**
 * MKT-006 component tests: the browse grid renders from the SSR initial page
 * without a client refetch, loading skeletons, the empty state with category
 * suggestion links, the error state with retry, the IntersectionObserver
 * sentinel walking pages (deduped while appending), and the per-page append
 * failure degrading to an inline retry row that keeps the loaded list. URL
 * state (param dropping, the /c/{slug} scope merge) is asserted on the
 * outgoing BFF request. MKT-007: the fa result count above the grid and the
 * q-aware zero-result state (remove-filters suggestion + popular categories).
 */

const fetchMock = jest.fn();

class MockIntersectionObserver {
  static latest: MockIntersectionObserver | null = null;
  readonly observe = jest.fn();
  readonly disconnect = jest.fn();
  readonly unobserve = jest.fn();
  private readonly callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    MockIntersectionObserver.latest = this;
  }

  trigger(): void {
    this.callback(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

function ok(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

interface RenderListProps {
  initialPage?: Paginated<LotCardResponseDto>;
  scope?: { categoryId: string };
}

/** Renders LotList under ONE QueryClient for the whole test (rerender keeps the cache). */
function renderList(props: RenderListProps = {}) {
  // staleTime mirrors the app provider (query-provider.tsx) — required for
  // the initialData tests: a stale SSR page WOULD legitimately refetch.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const element = <LotList {...props} />;
  const view = render(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>);
  return {
    ...view,
    rerenderWithSameCache: (next: RenderListProps = {}) => {
      view.rerender(
        <QueryClientProvider client={queryClient}>
          <LotList {...next} />
        </QueryClientProvider>,
      );
    },
  };
}

/** Query strings of every /api/lots call made so far (order preserved). */
function lotQueryStrings(): string[] {
  return (global.fetch as jest.Mock).mock.calls
    .map(([input]) => new URL(String(input), 'http://test.local'))
    .filter((url) => url.pathname === '/api/lots')
    .map((url) => url.searchParams.toString());
}

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof global.fetch;
  MockIntersectionObserver.latest = null;
  global.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;
  // Default: an empty listing plus the category tree for the suggestions.
  fetchMock.mockImplementation(async (input: unknown) => {
    const url = new URL(String(input), 'http://test.local');
    if (url.pathname === '/api/categories') {
      return ok(CATEGORY_TREE_FIXTURE);
    }
    return ok(cardPageFixture(1, [], 0));
  });
});

describe('LotList — data states', () => {
  it('renders the grid from the SSR initial page without a client refetch', async () => {
    renderList({ initialPage: cardPageFixture(1, ['ssr-a', 'ssr-b'], 2) });

    expect(await screen.findByText('لات ssr-a')).toBeInTheDocument();
    expect(screen.getByText('لات ssr-b')).toBeInTheDocument();
    expect(screen.getByTestId('lot-grid')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /لات ssr-a/ })).toHaveAttribute('href', '/l/code10');
    // SSR handoff — page 1 is never fetched again (no SSR/client double fetch).
    expect(lotQueryStrings()).toEqual([]);
  });

  it('shows skeletons while the first page loads', () => {
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    renderList();

    expect(screen.getByRole('status', { name: 'در حال بارگذاری لات‌ها' })).toBeInTheDocument();
  });

  it('shows the empty state with category suggestion links to /c/{slug}', async () => {
    renderList();

    expect(await screen.findByText('نتیجه‌ای یافت نشد')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'پوشاک' })).toHaveAttribute('href', '/c/apparel');
    expect(screen.getByRole('link', { name: 'خانه و آشپزخانه' })).toHaveAttribute(
      'href',
      '/c/home-kitchen',
    );
  });

  it('shows the error state with retry, which recovers into the list', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = new URL(String(input), 'http://test.local');
      if (url.pathname === '/api/categories') {
        return ok(CATEGORY_TREE_FIXTURE);
      }
      throw new Error('network down');
    });
    renderList();

    expect(await screen.findByRole('alert')).toHaveTextContent('دریافت لات‌ها ناموفق بود');
    expect(screen.getByRole('button', { name: /تلاش مجدد/ })).toBeInTheDocument();

    fetchMock.mockImplementation(async (input: unknown) => {
      const url = new URL(String(input), 'http://test.local');
      if (url.pathname === '/api/categories') {
        return ok(CATEGORY_TREE_FIXTURE);
      }
      return ok(cardPageFixture(1, ['recovered'], 1));
    });
    await user.click(screen.getByRole('button', { name: /تلاش مجدد/ }));

    expect(await screen.findByText('لات recovered')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('LotList — MKT-007 result count', () => {
  it('shows the fa total above the grid («X لات»)', async () => {
    renderList({ initialPage: cardPageFixture(1, ['c-1', 'c-2'], 12) });

    expect(await screen.findByText('۱۲ لات')).toBeInTheDocument();
    expect(screen.getByTestId('lot-grid')).toBeInTheDocument();
    // The count is live-region announced as the URL state changes it.
    expect(screen.getByText('۱۲ لات')).toHaveAttribute('aria-live', 'polite');
  });
});

describe('LotList — URL state', () => {
  it('issues the query from the URL params', async () => {
    mockParams.current = new URLSearchParams({ q: 'shirt', sort: 'priceAsc' });
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = new URL(String(input), 'http://test.local');
      if (url.pathname === '/api/categories') {
        return ok(CATEGORY_TREE_FIXTURE);
      }
      return ok(cardPageFixture(1, ['u-1'], 1));
    });
    renderList();

    await screen.findByText('لات u-1');
    expect(lotQueryStrings()).toEqual(['q=shirt&sort=priceAsc&page=1&limit=24']);
  });

  it('drops malformed URL params before fetching (bad sort/enums, non-numeric bounds)', async () => {
    mockParams.current = new URLSearchParams([
      ['sort', 'bogus'],
      ['condition', 'USED'],
      ['condition', 'FAKE'],
      ['priceMin', 'abc'],
      ['listedWithin', '7d'],
    ]);
    renderList();

    await screen.findByText('نتیجه‌ای یافت نشد');
    const search = new URLSearchParams(lotQueryStrings()[0]);
    expect(search.get('sort')).toBeNull();
    expect(search.get('priceMin')).toBeNull();
    expect(search.getAll('condition')).toEqual(['USED']);
    expect(search.get('listedWithin')).toBe('7d');
  });

  it('re-fetches when the URL params change (shareable links, back button)', async () => {
    mockParams.current = new URLSearchParams({ q: 'shirt' });
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = new URL(String(input), 'http://test.local');
      if (url.pathname === '/api/categories') {
        return ok(CATEGORY_TREE_FIXTURE);
      }
      const q = url.searchParams.get('q') ?? '';
      return ok(cardPageFixture(1, [`u-${q}`], 1));
    });
    const view = renderList();
    await screen.findByText('لات u-shirt');

    mockParams.current = new URLSearchParams({ q: 'jacket' });
    view.rerenderWithSameCache();

    await screen.findByText('لات u-jacket');
    expect(lotQueryStrings()).toEqual(['q=shirt&page=1&limit=24', 'q=jacket&page=1&limit=24']);
  });

  it('lets a page scope win over the URL category (the /c/{slug} pre-scoping)', async () => {
    mockParams.current = new URLSearchParams({ categoryId: 'cat-from-url' });
    renderList({ scope: { categoryId: 'cat-fixed' } });

    await screen.findByText('نتیجه‌ای یافت نشد');
    const search = new URLSearchParams(lotQueryStrings()[0]);
    expect(search.get('categoryId')).toBe('cat-fixed');
    expect(search.getAll('categoryId')).toEqual(['cat-fixed']);
  });
});

describe('LotList — MKT-007 zero-result with q', () => {
  it('names the q, suggests removing the filters, and keeps popular categories', async () => {
    mockParams.current = new URLSearchParams({ q: 'چیز ناموجود' });
    renderList();

    expect(await screen.findByText('نتیجه‌ای برای «چیز ناموجود» یافت نشد')).toBeInTheDocument();
    expect(screen.getByText(/فیلترها را بردارید/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'پوشاک' })).toHaveAttribute('href', '/c/apparel');
  });
});

describe('LotList — infinite scroll', () => {
  it('loads the next page when the sentinel intersects, then ends the list', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = new URL(String(input), 'http://test.local');
      if (url.pathname === '/api/categories') {
        return ok(CATEGORY_TREE_FIXTURE);
      }
      if (url.searchParams.get('page') === '2') {
        return ok(cardPageFixture(2, ['scroll-2'], 25));
      }
      return ok(cardPageFixture(1, ['scroll-1'], 25));
    });
    renderList();
    await screen.findByText('لات scroll-1');

    MockIntersectionObserver.latest?.trigger();

    expect(await screen.findByText('لات scroll-2')).toBeInTheDocument();
    // Page 2 of 25/24 is the last one — the end-of-list caption closes the grid.
    expect(await screen.findByText('همه لات‌ها نمایش داده شد')).toBeInTheDocument();
  });

  it('keeps the loaded list and shows an inline retry row when an append fails', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = new URL(String(input), 'http://test.local');
      if (url.pathname === '/api/categories') {
        return ok(CATEGORY_TREE_FIXTURE);
      }
      if (url.searchParams.get('page') === '2') {
        throw new Error('page 2 down');
      }
      return ok(cardPageFixture(1, ['kept-1'], 25));
    });
    renderList();
    await screen.findByText('لات kept-1');

    MockIntersectionObserver.latest?.trigger();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('بارگذاری ادامه فهرست ناموفق بود.');
    // The list is preserved — only the append broke.
    expect(screen.getByText('لات kept-1')).toBeInTheDocument();

    fetchMock.mockImplementation(async (input: unknown) => {
      const url = new URL(String(input), 'http://test.local');
      if (url.pathname === '/api/categories') {
        return ok(CATEGORY_TREE_FIXTURE);
      }
      return ok(cardPageFixture(2, ['kept-2'], 25));
    });
    await user.click(screen.getByRole('button', { name: /تلاش مجدد/ }));

    expect(await screen.findByText('لات kept-2')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not double-fetch while appending when the sentinel keeps intersecting', async () => {
    let releaseNext: ((response: Response) => void) | undefined;
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = new URL(String(input), 'http://test.local');
      if (url.pathname === '/api/categories') {
        return ok(CATEGORY_TREE_FIXTURE);
      }
      if (url.searchParams.get('page') === '2') {
        return new Promise<Response>((resolve) => {
          releaseNext = resolve;
        });
      }
      return ok(cardPageFixture(1, ['single-1'], 25));
    });
    renderList();
    await screen.findByText('لات single-1');

    MockIntersectionObserver.latest?.trigger();
    // The append started (page 2 requested) and stays pending for now.
    await waitFor(() => expect(lotQueryStrings()).toHaveLength(2));

    // The sentinel is still visible — a second hit must not re-request page 2.
    MockIntersectionObserver.latest?.trigger();

    releaseNext?.(ok(cardPageFixture(2, ['single-2'], 25)));
    expect(await screen.findByText('لات single-2')).toBeInTheDocument();
    const pageParams = lotQueryStrings().map((search) => new URLSearchParams(search).get('page'));
    expect(pageParams).toEqual(['1', '2']);
  });

  it('shows the end-of-list caption when the initial page is already the last', async () => {
    renderList({ initialPage: cardPageFixture(1, ['only'], LOT_LIST_PAGE_SIZE) });

    expect(await screen.findByText('لات only')).toBeInTheDocument();
    expect(screen.getByText('همه لات‌ها نمایش داده شد')).toBeInTheDocument();
    expect(lotQueryStrings()).toEqual([]);
  });
});
