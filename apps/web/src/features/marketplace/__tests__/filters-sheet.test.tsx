const mockRouterPush = jest.fn();
const mockPathname = { current: '/lots' };
const mockParams = { current: new URLSearchParams() };

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
  usePathname: () => mockPathname.current,
  useSearchParams: () => mockParams.current,
}));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FiltersSheet } from '../components/filters-sheet';
import { CATEGORY_TREE_FIXTURE } from '../testing/fixtures';

/**
 * MKT-008 component tests for the filter sheet: open/close a11y (initial
 * focus, Escape, overlay click, focus restore, Tab trap), the draft seeded
 * from the URL on open, «اعمال» committing the draft to the SAME params the
 * API reads (fa digits normalized, category cascade, city cascade, freshness)
 * while q/sort survive, invalid min>max drafts blocked client-side, «حذف
 * فیلترها» keeping q/sort, and the /c/{slug} category lock (hideCategory).
 * The category tree loads through the BFF (mocked here) like in production.
 */

const fetchMock = jest.fn();

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

/** Renders the sheet with a seeded URL and opens it. */
async function openSheet(search = '', props: Parameters<typeof FiltersSheet>[0] = {}) {
  mockParams.current = new URLSearchParams(search);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <FiltersSheet {...props} />
    </QueryClientProvider>,
  );
  await userEvent.click(screen.getByRole('button', { name: /فیلترها/ }));
  await screen.findByRole('dialog', { name: /فیلترها/ });
  return view;
}

/** Params of the pushed href (URLSearchParams encodes non-ASCII — compare parsed). */
function pushedParams(): URLSearchParams {
  const href = mockRouterPush.mock.calls[0]?.[0] as string;
  return new URL(href, 'http://test.local').searchParams;
}

beforeEach(() => {
  mockRouterPush.mockReset();
  mockPathname.current = '/lots';
  mockParams.current = new URLSearchParams();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input: unknown) => {
    const url = new URL(String(input), 'http://test.local');
    return url.pathname === '/api/categories' ? ok(CATEGORY_TREE_FIXTURE) : ok({});
  });
  global.fetch = fetchMock as unknown as typeof global.fetch;
});

describe('FiltersSheet — open/close a11y', () => {
  it('opens on the trigger, names the dialog and moves focus into the panel', async () => {
    await openSheet();
    const dialog = screen.getByRole('dialog', { name: /فیلترها/ });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveFocus();
  });

  it('closes on Escape and restores focus to the trigger', async () => {
    const user = userEvent.setup();
    const view = await openSheet();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(view.getByRole('button', { name: /فیلترها/ })).toHaveFocus();
  });

  it('closes on the overlay click and on the close button', async () => {
    const user = userEvent.setup();
    await openSheet();

    fireEvent.click(document.querySelector('[data-slot="sheet-overlay"]') as Element);
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(screen.getByRole('button', { name: /فیلترها/ }));
    await user.click(screen.getByRole('button', { name: 'بستن' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('traps Tab: forward from the last control wraps to the first, and back', async () => {
    await openSheet();

    const apply = screen.getByRole('button', { name: 'اعمال' });
    const close = screen.getByRole('button', { name: 'بستن' });

    apply.focus();
    fireEvent.keyDown(apply, { key: 'Tab' });
    expect(close).toHaveFocus();

    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(apply).toHaveFocus();
  });
});

describe('FiltersSheet — draft and apply', () => {
  it('seeds the draft from the URL when opened (deep links reproduce)', async () => {
    const user = userEvent.setup();
    await openSheet('priceMin=7000&condition=USED');

    expect(screen.getByLabelText('حداقل قیمت (تومان)')).toHaveValue('7000');
    expect(screen.getByRole('button', { name: 'کارکرده' })).toHaveAttribute('aria-pressed', 'true');

    // Closing without applying must not touch the URL.
    await user.keyboard('{Escape}');
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it('«اعمال» commits the draft to the URL with the API param names', async () => {
    const user = userEvent.setup();
    await openSheet('q=تیشرت&sort=priceAsc');

    await user.type(screen.getByLabelText('حداقل قیمت (تومان)'), '۱۲۰٬۰۰۰');
    await user.type(screen.getByLabelText('حداکثر موجودی'), '800');
    await user.click(screen.getByRole('button', { name: 'نو' }));
    await user.click(screen.getByRole('button', { name: 'تولید مازاد' }));
    await user.click(screen.getByRole('button', { name: 'هفت روز گذشته' }));
    await user.click(screen.getByRole('button', { name: 'اعمال' }));

    expect(mockRouterPush).toHaveBeenCalledTimes(1);
    const params = pushedParams();
    expect(params.get('priceMin')).toBe('120000'); // fa digits + separators normalized
    expect(params.get('qtyMax')).toBe('800');
    expect(params.getAll('condition')).toEqual(['NEW']);
    expect(params.getAll('liquidationReason')).toEqual(['EXCESS_PRODUCTION']);
    expect(params.get('listedWithin')).toBe('7d');
    // q/sort are never the sheet's business.
    expect(params.get('q')).toBe('تیشرت');
    expect(params.get('sort')).toBe('priceAsc');
    // The sheet closes after a successful apply.
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('commits the category cascade (parent, then enabled child)', async () => {
    const user = userEvent.setup();
    await openSheet();

    await user.selectOptions(screen.getByLabelText('دسته‌بندی'), 'cat-apparel');
    await user.selectOptions(screen.getByLabelText('زیر‌دسته'), 'cat-men');
    await user.click(screen.getByRole('button', { name: 'اعمال' }));

    const params = pushedParams();
    expect(params.get('categoryId')).toBe('cat-apparel');
    expect(params.get('subcategoryId')).toBe('cat-men');
  });

  it('commits the province→city cascade', async () => {
    const user = userEvent.setup();
    await openSheet();

    const province = screen.getByLabelText('استان') as HTMLSelectElement;
    const city = screen.getByLabelText('شهر') as HTMLSelectElement;
    expect(city).toBeDisabled();

    await user.selectOptions(province, 'tehran');
    expect(city).toBeEnabled();
    await user.selectOptions(city, 'tehran');
    await user.click(screen.getByRole('button', { name: 'اعمال' }));

    const params = pushedParams();
    expect(params.get('province')).toBe('tehran');
    expect(params.get('city')).toBe('tehran');
  });

  it('REPLACES previous filter params instead of appending (unset → cleared)', async () => {
    const user = userEvent.setup();
    await openSheet('listedWithin=7d&condition=USED');

    // Picking the other freshness window replaces the seed; removing the
    // condition chip drops it entirely.
    await user.click(screen.getByRole('button', { name: 'سی روز گذشته' }));
    await user.click(screen.getByRole('button', { name: 'کارکرده' }));
    await user.click(screen.getByRole('button', { name: 'اعمال' }));

    const params = pushedParams();
    expect(params.get('listedWithin')).toBe('30d');
    expect(params.has('condition')).toBe(false);
  });

  it('blocks priceMin > priceMax client-side and never navigates', async () => {
    const user = userEvent.setup();
    await openSheet();

    await user.type(screen.getByLabelText('حداقل قیمت (تومان)'), '500000');
    await user.type(screen.getByLabelText('حداکثر قیمت (تومان)'), '100000');
    await user.click(screen.getByRole('button', { name: 'اعمال' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'حداقل قیمت نمی‌تواند از حداکثر آن بیشتر باشد',
    );
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it('«حذف فیلترها» clears the filter params and keeps q/sort', async () => {
    const user = userEvent.setup();
    await openSheet('q=تیشرت&sort=priceDesc&priceMin=5&condition=USED&city=tehran');

    await user.click(screen.getByRole('button', { name: 'حذف فیلترها' }));

    expect(mockRouterPush).toHaveBeenCalledTimes(1);
    const params = pushedParams();
    expect([...params.keys()].sort()).toEqual(['q', 'sort']);
    expect(params.get('q')).toBe('تیشرت');
    expect(params.get('sort')).toBe('priceDesc');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('pushes the /c/{slug} path unchanged (category landings keep their slug)', async () => {
    const user = userEvent.setup();
    mockPathname.current = '/c/apparel';
    await openSheet('priceMin=50');

    await user.click(screen.getByRole('button', { name: 'اعمال' }));

    expect(mockRouterPush).toHaveBeenCalledTimes(1);
    const href = mockRouterPush.mock.calls[0]?.[0] as string;
    expect(href.startsWith('/c/apparel?')).toBe(true);
  });
});

describe('FiltersSheet — category landing lock', () => {
  it('hides the cascade and never writes category params when hideCategory', async () => {
    const user = userEvent.setup();
    await openSheet('categoryId=cat-apparel&subcategoryId=cat-men&priceMin=50', {
      hideCategory: true,
    });

    expect(screen.queryByLabelText('دسته‌بندی')).toBeNull();
    expect(screen.getByLabelText('حداقل قیمت (تومان)')).toHaveValue('50');

    await user.click(screen.getByRole('button', { name: 'اعمال' }));

    const params = pushedParams();
    expect(params.has('categoryId')).toBe(false);
    expect(params.has('subcategoryId')).toBe(false);
    expect(params.get('priceMin')).toBe('50');
  });
});
