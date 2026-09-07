import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockRouterPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush, replace: jest.fn(), back: jest.fn() }),
}));

import { SearchBar } from '../components/search-bar';
import { RECENT_SEARCHES_KEY } from '../lib/recent-searches';
import { normalizeSearchInput } from '../lib/search-normalize';

/**
 * MKT-007 component tests: submit navigates to /lots with the NORMALIZED q
 * (fa digits/ZWNJ/Arabic chars folded), the min-length hint for a
 * 1-effective-char query and no navigation, the clear (×) button, the recent
 * searches dropdown (focus+empty only; pick/remove/clear-all) and the
 * initialQuery prefill for /lots?q=… deep links. Recents persistence itself
 * is covered by recent-searches.test.ts; here the real localStorage stands in.
 */

/** The encoded /lots?q=… URL the bar must push for a raw query. */
function lotsUrl(rawQuery: string): string {
  return `/lots?${new URLSearchParams({ q: normalizeSearchInput(rawQuery) }).toString()}`;
}

function seedRecents(entries: string[]): void {
  window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(entries));
}

beforeEach(() => {
  mockRouterPush.mockReset();
  window.localStorage.clear();
});

describe('SearchBar — submit', () => {
  it('navigates to /lots with the normalized q and records the recent', async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    const input = screen.getByLabelText('جستجو در لات‌ها');

    await user.type(input, 'تی\u200cشرت ۵۰');
    await user.click(screen.getByRole('button', { name: 'جستجو' }));

    expect(mockRouterPush).toHaveBeenCalledTimes(1);
    expect(mockRouterPush).toHaveBeenCalledWith(lotsUrl('تی\u200cشرت ۵۰'));
    // The RECENT keeps the raw fa text the user typed (display fidelity).
    expect(JSON.parse(window.localStorage.getItem(RECENT_SEARCHES_KEY) ?? '[]')).toEqual([
      'تی\u200cشرت ۵۰',
    ]);
  });

  it('submits on Enter as well', async () => {
    const user = userEvent.setup();
    render(<SearchBar />);

    await user.type(screen.getByLabelText('جستجو در لات‌ها'), 'کفش ورزشی{Enter}');

    expect(mockRouterPush).toHaveBeenCalledWith(lotsUrl('کفش ورزشی'));
  });

  it('shows the min-length hint at 1 effective char and does not navigate', async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    const input = screen.getByLabelText('جستجو در لات‌ها');

    await user.type(input, 'ل');
    expect(screen.getByText('حداقل ۲ کاراکتر')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'جستجو' }));
    expect(mockRouterPush).not.toHaveBeenCalled();

    // The hint disappears once the query reaches the minimum.
    await user.type(input, 'و');
    expect(screen.queryByText('حداقل ۲ کاراکتر')).not.toBeInTheDocument();
  });

  it('does not treat a lone ZWNJ as a character (no hint, no navigation)', async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    const input = screen.getByLabelText('جستجو در لات‌ها');

    await user.type(input, '\u200c');
    expect(screen.queryByText('حداقل ۲ کاراکتر')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'جستجو' }));
    expect(mockRouterPush).not.toHaveBeenCalled();
  });
});

describe('SearchBar — clear', () => {
  it('empties the input via the × button', async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    const input = screen.getByLabelText('جستجو در لات‌ها');

    await user.type(input, 'گوشی');
    await user.click(screen.getByRole('button', { name: 'پاک کردن جستجو' }));

    expect(input).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'پاک کردن جستجو' })).not.toBeInTheDocument();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });
});

describe('SearchBar — recent searches dropdown', () => {
  it('shows recents on focus with an empty input, hidden while typing', async () => {
    const user = userEvent.setup();
    seedRecents(['گوشی', 'لپ تاپ']);
    render(<SearchBar />);
    const input = screen.getByLabelText('جستجو در لات‌ها');
    const list = () => screen.getByRole('list', { name: 'جستجوهای اخیر' });

    await user.click(input);
    expect(list()).toBeInTheDocument();
    expect(within(list()).getByText('گوشی')).toBeInTheDocument();
    expect(within(list()).getByText('لپ تاپ')).toBeInTheDocument();

    await user.type(input, 'گ');
    expect(screen.queryByRole('list', { name: 'جستجوهای اخیر' })).not.toBeInTheDocument();
  });

  it('navigates on a recent click and bubbles it to the top', async () => {
    const user = userEvent.setup();
    seedRecents(['لپ تاپ', 'گوشی']);
    render(<SearchBar />);
    const input = screen.getByLabelText('جستجو در لات‌ها');

    await user.click(input);
    await user.click(within(screen.getByRole('list', { name: 'جستجوهای اخیر' })).getByText('گوشی'));

    expect(mockRouterPush).toHaveBeenCalledWith(lotsUrl('گوشی'));
    expect(JSON.parse(window.localStorage.getItem(RECENT_SEARCHES_KEY) ?? '[]')).toEqual([
      'گوشی',
      'لپ تاپ',
    ]);
  });

  it('removes a single recent via its × button', async () => {
    const user = userEvent.setup();
    seedRecents(['گوشی', 'لپ تاپ']);
    render(<SearchBar />);

    await user.click(screen.getByLabelText('جستجو در لات‌ها'));
    await user.click(screen.getByRole('button', { name: 'حذف «گوشی»' }));

    const remaining = JSON.parse(window.localStorage.getItem(RECENT_SEARCHES_KEY) ?? '[]');
    expect(remaining).toEqual(['لپ تاپ']);
    expect(
      within(screen.getByRole('list', { name: 'جستجوهای اخیر' })).queryByText('گوشی'),
    ).not.toBeInTheDocument();
  });

  it('clears all recents and closes the dropdown', async () => {
    const user = userEvent.setup();
    seedRecents(['گوشی', 'لپ تاپ']);
    render(<SearchBar />);

    await user.click(screen.getByLabelText('جستجو در لات‌ها'));
    await user.click(screen.getByRole('button', { name: 'پاک کردن همه' }));

    expect(window.localStorage.getItem(RECENT_SEARCHES_KEY)).toBeNull();
    expect(screen.queryByRole('list', { name: 'جستجوهای اخیر' })).not.toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    seedRecents(['گوشی']);
    render(<SearchBar />);
    const input = screen.getByLabelText('جستجو در لات‌ها');

    await user.click(input);
    expect(screen.getByRole('list', { name: 'جستجوهای اخیر' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('list', { name: 'جستجوهای اخیر' })).not.toBeInTheDocument();
  });

  it('does not render the dropdown when there are no recents', async () => {
    const user = userEvent.setup();
    render(<SearchBar />);

    await user.click(screen.getByLabelText('جستجو در لات‌ها'));

    expect(screen.queryByRole('list', { name: 'جستجوهای اخیر' })).not.toBeInTheDocument();
  });
});

describe('SearchBar — deep-link prefill', () => {
  it('prefills the input from initialQuery (shared /lots?q=… link)', () => {
    render(<SearchBar initialQuery="کفش ورزشی" />);

    expect(screen.getByLabelText('جستجو در لات‌ها')).toHaveValue('کفش ورزشی');
  });
});
