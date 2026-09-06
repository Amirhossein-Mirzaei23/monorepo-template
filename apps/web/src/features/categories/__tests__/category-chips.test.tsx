import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { CategoryChips } from '../components/category-chips';

/**
 * CAT-003 component tests for CategoryChips: «parent › child» flat labels,
 * controlled toggle with aria-pressed, disable-at-max, and
 * loading/empty/error-retry states.
 */

const categoryTree = [
  {
    id: 'cat-apparel',
    nameFa: 'پوشاک',
    nameEn: null,
    slug: 'apparel',
    children: [
      { id: 'cat-apparel-men', nameFa: 'مردانه', nameEn: null, slug: 'apparel-men', children: [] },
    ],
  },
  {
    id: 'cat-beauty',
    nameFa: 'زیبایی و بهداشتی',
    nameEn: null,
    slug: 'beauty-health',
    children: [],
  },
];

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const fetchMock = jest.fn();

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

type ChipsProps = Parameters<typeof CategoryChips>[0];

async function renderChips(props: ChipsProps) {
  const utils = render(<CategoryChips {...props} />, { wrapper: createWrapper() });
  await screen.findByRole('group', { name: 'دسته‌بندی‌ها' });
  return utils;
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => jsonResponse(categoryTree));
  global.fetch = fetchMock as unknown as typeof global.fetch;
});

describe('CategoryChips — rendering', () => {
  it('renders parent and «parent › child» chips from the tree', async () => {
    await renderChips({ selected: [], onToggle: jest.fn() });

    expect(screen.getByRole('button', { name: 'پوشاک' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'پوشاک › مردانه' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'زیبایی و بهداشتی' })).toBeInTheDocument();
  });

  it('shows skeletons while loading', () => {
    fetchMock.mockImplementation(() => new Promise(() => undefined)); // never resolves
    render(<CategoryChips selected={[]} onToggle={jest.fn()} />, { wrapper: createWrapper() });
    expect(screen.getByLabelText('در حال بارگذاری دسته‌بندی‌ها')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'دسته‌بندی‌ها' })).toBeNull();
  });

  it('shows an error with a retry button that refetches', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ message: 'boom' }, 500));
    render(<CategoryChips selected={[]} onToggle={jest.fn()} />, { wrapper: createWrapper() });

    // The hook retries once (~1s backoff) before surfacing the error.
    expect(
      await screen.findByText('دسته‌بندی‌ها بارگذاری نشد.', {}, { timeout: 4000 }),
    ).toBeInTheDocument();
    fetchMock.mockImplementation(async () => jsonResponse(categoryTree));
    await userEvent.click(await screen.findByRole('button', { name: 'تلاش دوباره' }));
    expect(await screen.findByRole('group', { name: 'دسته‌بندی‌ها' })).toBeInTheDocument();
  }, 10000);

  it('shows the empty state when the tree is empty', async () => {
    fetchMock.mockImplementation(async () => jsonResponse([]));
    render(<CategoryChips selected={[]} onToggle={jest.fn()} />, { wrapper: createWrapper() });
    expect(await screen.findByText('دسته‌بندی‌ای یافت نشد.')).toBeInTheDocument();
  });
});

describe('CategoryChips — selection', () => {
  it('toggles a chip and reports its id', async () => {
    const onToggle = jest.fn();
    await renderChips({ selected: [], onToggle });

    const chip = screen.getByRole('button', { name: 'پوشاک › مردانه' });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(chip);
    expect(onToggle).toHaveBeenCalledWith('cat-apparel-men');
  });

  it('marks selected chips with aria-pressed (parent and child)', async () => {
    await renderChips({ selected: ['cat-apparel', 'cat-apparel-men'], onToggle: jest.fn() });

    expect(screen.getByRole('button', { name: 'پوشاک' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'پوشاک › مردانه' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'زیبایی و بهداشتی' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('disables unselected chips at the max cap while selected ones stay active', async () => {
    const onToggle = jest.fn();
    await renderChips({ selected: ['cat-apparel', 'cat-apparel-men'], onToggle, max: 2 });

    expect(screen.getByRole('button', { name: 'زیبایی و بهداشتی' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'پوشاک' })).toBeEnabled();

    await userEvent.click(screen.getByRole('button', { name: 'زیبایی و بهداشتی' }));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('shows the max hint with Persian digits', async () => {
    await renderChips({ selected: [], onToggle: jest.fn(), max: 10 });
    expect(screen.getByText('حداکثر ۱۰ دسته‌بندی')).toBeInTheDocument();
  });

  it('disables all chips when the disabled prop is set', async () => {
    await renderChips({ selected: [], onToggle: jest.fn(), disabled: true });
    expect(screen.getByRole('button', { name: 'پوشاک' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'پوشاک › مردانه' })).toBeDisabled();
  });
});
