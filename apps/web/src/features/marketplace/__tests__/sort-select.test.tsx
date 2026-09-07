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
import { SortSelect } from '../components/sort-select';

/**
 * MKT-008 component tests for the sort dropdown: the URL sort (or the API
 * default) is the selected value, a change COMMITS immediately to the URL
 * `sort` param and every other param (q, filters) survives untouched.
 */

function renderSelect(search: string) {
  mockParams.current = new URLSearchParams(search);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SortSelect />
    </QueryClientProvider>,
  );
}

/** Params of the pushed href (URLSearchParams encodes non-ASCII — compare parsed). */
function pushedParams(callIndex = 0): URLSearchParams {
  const href = mockRouterPush.mock.calls[callIndex]?.[0] as string;
  return new URL(href, 'http://test.local').searchParams;
}

beforeEach(() => {
  mockRouterPush.mockReset();
  mockParams.current = new URLSearchParams();
});

describe('SortSelect', () => {
  it('defaults to «جدیدترین» (the API default sort) when the URL has no sort', () => {
    renderSelect('');
    expect(screen.getByLabelText('مرتب‌سازی')).toHaveValue('createdAt');
    expect((screen.getByRole('option', { name: 'جدیدترین' }) as HTMLOptionElement).selected).toBe(
      true,
    );
  });

  it('renders the URL sort as selected on deep links', () => {
    renderSelect('sort=priceDesc');
    expect((screen.getByRole('option', { name: 'گران‌ترین' }) as HTMLOptionElement).selected).toBe(
      true,
    );
  });

  it('lists every fa label of the API sort allowlist', () => {
    renderSelect('');
    const labels = [
      'جدیدترین',
      'آخرین تغییر',
      'ارزان‌ترین',
      'گران‌ترین',
      'بیشترین موجودی',
      'کمترین موجودی',
      'نزدیک انقضا',
    ];
    for (const label of labels) {
      expect(screen.getByRole('option', { name: label })).toBeInTheDocument();
    }
  });

  it('commits the change immediately, keeping q and filter params', async () => {
    const user = userEvent.setup();
    renderSelect('q=تیشرت&priceMin=1000&condition=USED');

    await user.selectOptions(screen.getByLabelText('مرتب‌سازی'), 'quantityAsc');

    expect(mockRouterPush).toHaveBeenCalledTimes(1);
    const params = pushedParams();
    expect(params.get('sort')).toBe('quantityAsc');
    expect(params.get('q')).toBe('تیشرت');
    expect(params.get('priceMin')).toBe('1000');
    expect(params.getAll('condition')).toEqual(['USED']);
  });

  it('keeps a single-valued param set clean (no duplicates on re-sort)', async () => {
    const user = userEvent.setup();
    renderSelect('sort=priceAsc&q=shoes');

    await user.selectOptions(screen.getByLabelText('مرتب‌سازی'), 'priceDesc');

    const params = pushedParams();
    expect(params.getAll('sort')).toEqual(['priceDesc']);
    expect(params.get('q')).toBe('shoes');
  });
});
