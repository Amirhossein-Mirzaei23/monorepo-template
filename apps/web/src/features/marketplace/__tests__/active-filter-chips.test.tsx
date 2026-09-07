const mockRouterPush = jest.fn();
const mockParams = { current: new URLSearchParams() };

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
  usePathname: () => '/lots',
  useSearchParams: () => mockParams.current,
}));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActiveFilterChips } from '../components/active-filter-chips';
import { CATEGORY_TREE_FIXTURE } from '../testing/fixtures';

/**
 * MKT-008 component tests for the active-filter chips row: one chip per
 * active filter value, individual removal that touches ONLY its own param
 * (array members removed one by one; category removal takes its child),
 * «حذف همه» as the reset (filters cleared, q/sort kept) and a null render
 * when nothing is active. Category labels come from the tree (fa names) —
 * fetched through the public BFF like the rest of the feature.
 */

const fetchMock = jest.fn();

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

function renderChips(search: string) {
  mockParams.current = new URLSearchParams(search);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ActiveFilterChips />
    </QueryClientProvider>,
  );
}

function pushedParams(): URLSearchParams {
  const href = mockRouterPush.mock.calls[0]?.[0] as string;
  return new URL(href, 'http://test.local').searchParams;
}

beforeEach(() => {
  mockRouterPush.mockReset();
  mockParams.current = new URLSearchParams();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => ok(CATEGORY_TREE_FIXTURE));
  global.fetch = fetchMock as unknown as typeof global.fetch;
});

describe('ActiveFilterChips', () => {
  it('renders nothing when no filter is active', () => {
    const { container } = renderChips('');
    expect(container).toBeEmptyDOMElement();
  });

  it('renders one chip per active filter value with fa labels', async () => {
    renderChips(
      'q=تیشرت&condition=USED&condition=NEW&priceMin=100000&province=tehran&city=tehran&pricingType=NEGOTIABLE&listedWithin=7d',
    );

    expect(await screen.findByText('استان: تهران')).toBeInTheDocument();
    expect(screen.getByText('جستجو: تیشرت')).toBeInTheDocument();
    expect(screen.getByText('کارکرده')).toBeInTheDocument();
    expect(screen.getByText('نو')).toBeInTheDocument();
    expect(screen.getByText('حداقل قیمت: ۱۰۰٬۰۰۰ تومان')).toBeInTheDocument();
    expect(screen.getByText('شهر: تهران')).toBeInTheDocument();
    expect(screen.getByText('قابل مذاکره')).toBeInTheDocument();
    expect(screen.getByText('هفت روز گذشته')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'حذف همه' })).toBeInTheDocument();
  });

  it('shows category and subcategory fa names resolved from the tree', async () => {
    renderChips('categoryId=cat-apparel&subcategoryId=cat-men');
    expect(await screen.findByText('دسته: پوشاک')).toBeInTheDocument();
    expect(screen.getByText('زیر‌دسته: مردانه')).toBeInTheDocument();
  });

  it('removes ONE condition member without touching the other or the rest', async () => {
    const user = userEvent.setup();
    renderChips('q=تیشرت&sort=priceAsc&condition=USED&condition=NEW');
    await screen.findByText('کارکرده');

    await user.click(screen.getByRole('button', { name: 'حذف فیلتر «کارکرده»' }));

    expect(mockRouterPush).toHaveBeenCalledTimes(1);
    const params = pushedParams();
    expect(params.getAll('condition')).toEqual(['NEW']);
    expect(params.get('q')).toBe('تیشرت');
    expect(params.get('sort')).toBe('priceAsc');
  });

  it('removing the category chip takes the subcategory param with it', async () => {
    const user = userEvent.setup();
    renderChips('categoryId=cat-apparel&subcategoryId=cat-men&priceMax=500');
    await screen.findByText('دسته: پوشاک');

    await user.click(screen.getByRole('button', { name: 'حذف فیلتر «دسته: پوشاک»' }));

    const params = pushedParams();
    expect(params.has('categoryId')).toBe(false);
    expect(params.has('subcategoryId')).toBe(false);
    expect(params.get('priceMax')).toBe('500');
  });

  it('removing the price-min chip only drops priceMin', async () => {
    const user = userEvent.setup();
    renderChips('priceMin=100000&priceMax=900000');
    await screen.findByText('حداکثر قیمت: ۹۰۰٬۰۰۰ تومان');

    await user.click(screen.getByRole('button', { name: 'حذف فیلتر «حداقل قیمت: ۱۰۰٬۰۰۰ تومان»' }));

    const params = pushedParams();
    expect(params.has('priceMin')).toBe(false);
    expect(params.get('priceMax')).toBe('900000');
  });

  it('removing the last chip (here: q) pushes a bare path with no trailing «?»', async () => {
    const user = userEvent.setup();
    renderChips('q=تیشرت');
    await screen.findByText('جستجو: تیشرت');

    await user.click(screen.getByRole('button', { name: 'حذف فیلتر «جستجو: تیشرت»' }));

    expect(mockRouterPush).toHaveBeenCalledWith('/lots');
  });

  it('«حذف همه» clears every filter but keeps q and sort (card reset semantics)', async () => {
    const user = userEvent.setup();
    renderChips('q=تیشرت&sort=priceDesc&priceMin=1&city=tehran&condition=NEW&listedWithin=30d');
    await screen.findByText('شهر: تهران');

    await user.click(screen.getByRole('button', { name: 'حذف همه' }));

    expect(mockRouterPush).toHaveBeenCalledTimes(1);
    const params = pushedParams();
    expect([...params.keys()].sort()).toEqual(['q', 'sort']);
    expect(params.get('q')).toBe('تیشرت');
    expect(params.get('sort')).toBe('priceDesc');
  });
});
