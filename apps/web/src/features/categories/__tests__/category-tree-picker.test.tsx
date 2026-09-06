import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { CategoryTreePicker, type CategoryPickerValue } from '../components/category-tree-picker';

/**
 * CAT-003 component tests for CategoryTreePicker: cascading behavior (parent
 * filters children, changing parent resets child), active-only rendering
 * (unknown ids degrade to placeholder), loading/empty/error-retry states, and
 * keyboard navigability of the native selects.
 */

const categoryTree = [
  {
    id: 'cat-apparel',
    nameFa: 'پوشاک',
    nameEn: null,
    slug: 'apparel',
    children: [
      { id: 'cat-apparel-men', nameFa: 'مردانه', nameEn: null, slug: 'apparel-men', children: [] },
      {
        id: 'cat-apparel-women',
        nameFa: 'زنانه',
        nameEn: null,
        slug: 'apparel-women',
        children: [],
      },
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

/** Controlled harness — mirrors real usage where a form owns the value. */
function StatefulPicker(props: {
  onValueChange?: (value: CategoryPickerValue) => void;
  initialValue?: CategoryPickerValue;
  disabled?: boolean;
}) {
  const [value, setValue] = useState<CategoryPickerValue>(props.initialValue ?? {});
  return (
    <CategoryTreePicker
      value={value}
      disabled={props.disabled}
      onChange={(next) => {
        props.onValueChange?.(next);
        setValue(next);
      }}
    />
  );
}

async function renderPicker(props: Parameters<typeof StatefulPicker>[0] = {}) {
  const utils = render(<StatefulPicker {...props} />, { wrapper: createWrapper() });
  // Wait for the tree fetch to resolve so tests interact with loaded selects.
  await screen.findByLabelText('دسته‌بندی');
  return utils;
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => jsonResponse(categoryTree));
  global.fetch = fetchMock as unknown as typeof global.fetch;
});

describe('CategoryTreePicker — data states', () => {
  it('shows skeletons while the tree is loading', () => {
    fetchMock.mockImplementation(() => new Promise(() => undefined)); // never resolves
    render(<StatefulPicker />, { wrapper: createWrapper() });
    expect(screen.getByLabelText('در حال بارگذاری دسته‌بندی‌ها')).toBeInTheDocument();
    expect(screen.queryByLabelText('دسته‌بندی')).toBeNull();
  });

  it('shows an error with a retry button that refetches', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ message: 'boom' }, 500));
    render(<StatefulPicker />, { wrapper: createWrapper() });

    // The hook retries once (~1s backoff) before surfacing the error.
    expect(
      await screen.findByText('دسته‌بندی‌ها بارگذاری نشد.', {}, { timeout: 4000 }),
    ).toBeInTheDocument();
    fetchMock.mockImplementation(async () => jsonResponse(categoryTree));
    await userEvent.click(await screen.findByRole('button', { name: 'تلاش دوباره' }));
    expect(await screen.findByLabelText('دسته‌بندی')).toBeInTheDocument();
  }, 10000);

  it('shows the empty state when the tree is empty', async () => {
    fetchMock.mockImplementation(async () => jsonResponse([]));
    render(<StatefulPicker />, { wrapper: createWrapper() });
    expect(await screen.findByText('دسته‌بندی‌ای یافت نشد.')).toBeInTheDocument();
  });

  it('fetches the tree through the public BFF route', () => {
    render(<StatefulPicker />, { wrapper: createWrapper() });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/categories',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});

describe('CategoryTreePicker — cascading behavior', () => {
  it('lists parents and enables the child select only after a parent is chosen', async () => {
    await renderPicker();

    const parent = screen.getByLabelText('دسته‌بندی') as HTMLSelectElement;
    expect(parent).toBeEnabled();
    expect(screen.getByRole('option', { name: 'پوشاک' })).toBeInTheDocument();

    const child = screen.getByLabelText('زیر‌دسته') as HTMLSelectElement;
    expect(child).toBeDisabled();
    expect(screen.getByRole('option', { name: 'ابتدا دسته‌بندی' })).toBeInTheDocument();

    await userEvent.selectOptions(parent, 'cat-apparel');
    expect(child).toBeEnabled();
    expect(screen.getByRole('option', { name: 'مردانه' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'همه زیر‌دسته‌ها' })).toBeInTheDocument();
  });

  it('reports the parent selection and clears the child', async () => {
    const onValueChange = jest.fn();
    await renderPicker({ onValueChange });

    await userEvent.selectOptions(screen.getByLabelText('دسته‌بندی'), 'cat-apparel');
    expect(onValueChange).toHaveBeenLastCalledWith({ parentId: 'cat-apparel', childId: undefined });
  });

  it('resets the child when the parent changes', async () => {
    const onValueChange = jest.fn();
    await renderPicker({
      onValueChange,
      initialValue: { parentId: 'cat-apparel', childId: 'cat-apparel-men' },
    });

    expect(screen.getByLabelText('زیر‌دسته')).toHaveValue('cat-apparel-men');
    await userEvent.selectOptions(screen.getByLabelText('دسته‌بندی'), 'cat-beauty');
    expect(onValueChange).toHaveBeenLastCalledWith({ parentId: 'cat-beauty', childId: undefined });
  });

  it('reports the child selection while keeping the parent', async () => {
    const onValueChange = jest.fn();
    await renderPicker({
      onValueChange,
      initialValue: { parentId: 'cat-apparel' },
    });

    await userEvent.selectOptions(screen.getByLabelText('زیر‌دسته'), 'cat-apparel-women');
    expect(onValueChange).toHaveBeenLastCalledWith({
      parentId: 'cat-apparel',
      childId: 'cat-apparel-women',
    });
  });

  it('allows going back to «همه زیر‌دسته‌ها» (child cleared)', async () => {
    const onValueChange = jest.fn();
    await renderPicker({
      onValueChange,
      initialValue: { parentId: 'cat-apparel', childId: 'cat-apparel-men' },
    });

    await userEvent.selectOptions(screen.getByLabelText('زیر‌دسته'), '');
    expect(onValueChange).toHaveBeenLastCalledWith({
      parentId: 'cat-apparel',
      childId: undefined,
    });
  });

  it('degrades unknown ids to placeholders (active-only tree)', async () => {
    await renderPicker({ initialValue: { parentId: 'cat-deleted', childId: 'cat-also-deleted' } });

    expect(screen.getByLabelText('دسته‌بندی')).toHaveValue('');
    expect(screen.getByLabelText('زیر‌دسته')).toBeDisabled();
  });

  it('disables both selects when disabled', async () => {
    await renderPicker({ disabled: true });
    expect(screen.getByLabelText('دسته‌بندی')).toBeDisabled();
    expect(screen.getByLabelText('زیر‌دسته')).toBeDisabled();
  });
});

describe('CategoryTreePicker — keyboard navigation', () => {
  it('reaches the parent select with the keyboard and changes it', async () => {
    const onValueChange = jest.fn();
    const { container } = await renderPicker({ onValueChange });

    await userEvent.tab();
    expect(screen.getByLabelText('دسته‌بندی')).toHaveFocus();

    await userEvent.selectOptions(screen.getByLabelText('دسته‌بندی'), 'cat-apparel');
    await waitFor(() =>
      expect(onValueChange).toHaveBeenLastCalledWith({
        parentId: 'cat-apparel',
        childId: undefined,
      }),
    );
    expect(container).toBeInTheDocument();
  });
});
