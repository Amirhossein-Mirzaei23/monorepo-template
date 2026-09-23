import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';

// jest.mock's string argument is resolved literally, so the alias fails here.
jest.mock('../../../providers/auth-provider', () => ({
  useAuth: () => ({ accessToken: () => 'test-access-token' }),
}));

import { AdminCategories } from '../components/admin-categories';

/**
 * Admin categories tree editor (Task 06): create root, create child, edit,
 * deactivate/reactivate, up/down reorder, 409 slug conflict + 400 depth error
 * rendering — exercised through the mocked BFF fetch hop (admin-users test
 * idiom: real providers, mocked fetch). Zero state and inactive-rows-visible
 * state included; the always-visible safety copy about historical lots too.
 */

const fetchMock = jest.fn();

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function ok(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function categoryFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cat-root',
    nameFa: 'پوشاک',
    nameEn: 'Apparel',
    slug: 'apparel',
    parentId: null,
    sortOrder: 0,
    isActive: true,
    directLotCount: 3,
    visibleLotCount: 1,
    children: [],
    ...overrides,
  };
}

const treeFixture = [
  categoryFixture({
    children: [
      categoryFixture({
        id: 'cat-men',
        nameFa: 'مردانه',
        nameEn: 'Men',
        slug: 'apparel-men',
        parentId: 'cat-root',
        sortOrder: 1,
        directLotCount: 2,
        visibleLotCount: 2,
      }),
      categoryFixture({
        id: 'cat-hidden',
        nameFa: 'بچگانه',
        nameEn: null,
        slug: 'apparel-kids',
        parentId: 'cat-root',
        sortOrder: 2,
        isActive: false,
        directLotCount: 0,
        visibleLotCount: 0,
      }),
    ],
  }),
  categoryFixture({
    id: 'cat-shoes',
    nameFa: 'کفش',
    nameEn: null,
    slug: 'shoes',
    sortOrder: 1,
    directLotCount: 0,
    visibleLotCount: 0,
  }),
];

/** Installs a fetch mock that answers the tree GET and records writes. */
function mockTree(tree: unknown = treeFixture) {
  const writes: Array<{ method: string; url: string; body: unknown }> = [];
  fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body !== undefined ? JSON.parse(String(init.body)) : undefined;
    if (method !== 'GET') {
      writes.push({ method, url, body });
      return ok({
        id: 'new-id',
        nameFa: '',
        slug: '',
        parentId: null,
        sortOrder: 0,
        isActive: true,
      });
    }
    if (url === '/api/admin/categories') {
      return ok(tree);
    }
    return ok([]);
  });
  return writes;
}

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof global.fetch;
});

describe('AdminCategories — zero state and tree rendering', () => {
  it('shows the zero state and the create-root button when the tree is empty', async () => {
    mockTree([]);
    render(<AdminCategories />, { wrapper: createWrapper() });

    expect(await screen.findByTestId('admin-categories-empty')).toBeInTheDocument();
    expect(screen.getByText('هنوز دسته‌ای ثبت نشده است')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'افزودن دستهٔ اصلی' })).toBeEnabled();
  });

  it('renders the full tree including inactive rows and per-node lot counts', async () => {
    mockTree();
    render(<AdminCategories />, { wrapper: createWrapper() });

    expect(await screen.findByText('پوشاک')).toBeInTheDocument();
    expect(screen.getByText('مردانه')).toBeInTheDocument();
    // Inactive rows are visible (manageable) with their Persian chip.
    expect(screen.getByText('بچگانه')).toBeInTheDocument();
    expect(screen.getByText('غیرفعال')).toBeInTheDocument();
    // Bounded counts in Persian digits: direct + visible subset.
    expect(screen.getByText('لات‌ها: ۳')).toBeInTheDocument();
    expect(screen.getByText('(نمایان: ۱)')).toBeInTheDocument();
    // Several nodes have no lots — counts are always 0/0, never undefined.
    expect(screen.getAllByText('لات‌ها: ۰').length).toBeGreaterThanOrEqual(2);
    // The always-visible safety copy about historical lots.
    expect(screen.getByTestId('admin-categories-safety')).toHaveTextContent('لات‌های تاریخی');
  });

  it('disables the reorder buttons at the sibling edges', async () => {
    mockTree();
    render(<AdminCategories />, { wrapper: createWrapper() });

    await screen.findByText('پوشاک');
    // First root cannot go up; last root cannot go down.
    expect(screen.getByRole('button', { name: 'انتقال پوشاک به بالا' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'انتقال کفش به پایین' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'انتقال پوشاک به پایین' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'انتقال کفش به بالا' })).toBeEnabled();
  });
});

describe('AdminCategories — create', () => {
  it('creates a root category (parentId null)', async () => {
    const user = userEvent.setup();
    const writes = mockTree();
    render(<AdminCategories />, { wrapper: createWrapper() });

    await user.click(await screen.findByRole('button', { name: 'افزودن دستهٔ اصلی' }));
    const dialog = await screen.findByRole('dialog', { name: 'افزودن دستهٔ اصلی' });
    await user.type(screen.getByLabelText('نام فارسی'), 'کتاب و لوازم');
    await user.type(screen.getByLabelText('اسلاگ'), 'stationery');
    await user.click(within(dialog).getByRole('button', { name: 'ذخیره' }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({
      method: 'POST',
      url: '/api/admin/categories',
      body: { nameFa: 'کتاب و لوازم', nameEn: null, slug: 'stationery', parentId: null },
    });
  });

  it('creates a child under its parent (parentId fixed to the row)', async () => {
    const user = userEvent.setup();
    const writes = mockTree();
    render(<AdminCategories />, { wrapper: createWrapper() });

    await user.click(await screen.findByRole('button', { name: 'افزودن زیر‌دسته برای پوشاک' }));
    await screen.findByRole('dialog', { name: 'افزودن زیر‌دسته برای پوشاک' });
    await user.type(screen.getByLabelText('نام فارسی'), 'ورزشی');
    await user.type(screen.getByLabelText('اسلاگ'), 'apparel-sports');
    await user.click(screen.getByRole('button', { name: 'ذخیره' }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({
      method: 'POST',
      url: '/api/admin/categories',
      body: { nameFa: 'ورزشی', nameEn: null, slug: 'apparel-sports', parentId: 'cat-root' },
    });
  });

  it('renders the 409 slug conflict as an inline alert inside the dialog', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method !== 'GET') {
        return ok({ statusCode: 409, message: 'Category slug "apparel" is already in use' }, 409);
      }
      if (String(input) === '/api/admin/categories') {
        return ok(treeFixture);
      }
      return ok([]);
    });
    render(<AdminCategories />, { wrapper: createWrapper() });

    await user.click(await screen.findByRole('button', { name: 'افزودن دستهٔ اصلی' }));
    await screen.findByRole('dialog', { name: 'افزودن دستهٔ اصلی' });
    await user.type(screen.getByLabelText('نام فارسی'), 'پوشاک دیگر');
    await user.type(screen.getByLabelText('اسلاگ'), 'apparel');
    await user.click(screen.getByRole('button', { name: 'ذخیره' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'این اسلاگ قبلاً استفاده شده است؛ اسلاگ دیگری انتخاب کنید.',
    );
    // The dialog stays open so the admin can fix the slug.
    expect(screen.getByRole('dialog', { name: 'افزودن دستهٔ اصلی' })).toBeInTheDocument();
  });

  it('renders the 400 depth violation as an inline alert inside the dialog', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method !== 'GET') {
        return ok({ statusCode: 400, message: 'Categories are limited to two levels' }, 400);
      }
      if (String(input) === '/api/admin/categories') {
        return ok(treeFixture);
      }
      return ok([]);
    });
    render(<AdminCategories />, { wrapper: createWrapper() });

    await user.click(await screen.findByRole('button', { name: 'افزودن دستهٔ اصلی' }));
    await screen.findByRole('dialog', { name: 'افزودن دستهٔ اصلی' });
    await user.type(screen.getByLabelText('نام فارسی'), 'تی‌شرت');
    await user.type(screen.getByLabelText('اسلاگ'), 'tshirt');
    await user.click(screen.getByRole('button', { name: 'ذخیره' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'این تغییر با قواعد درخت دسته‌بندی (حداکثر دو سطح) سازگار نیست.',
    );
  });

  it('rejects a malformed slug locally before any request is sent', async () => {
    const user = userEvent.setup();
    const writes = mockTree();
    render(<AdminCategories />, { wrapper: createWrapper() });

    await user.click(await screen.findByRole('button', { name: 'افزودن دستهٔ اصلی' }));
    await screen.findByRole('dialog', { name: 'افزودن دستهٔ اصلی' });
    await user.type(screen.getByLabelText('نام فارسی'), 'نامعتبر');
    await user.type(screen.getByLabelText('اسلاگ'), 'Not Kebab!');
    await user.click(screen.getByRole('button', { name: 'ذخیره' }));

    // zod resolver blocks the submit — no write request may leave.
    expect(writes).toHaveLength(0);
    expect(screen.getByText(/اسلاگ باید/)).toBeInTheDocument();
  });
});

describe('AdminCategories — edit', () => {
  it('opens prefilled and PATCHes only through the dialog payload', async () => {
    const user = userEvent.setup();
    const writes = mockTree();
    render(<AdminCategories />, { wrapper: createWrapper() });

    await user.click(await screen.findByRole('button', { name: 'ویرایش مردانه' }));
    const dialog = await screen.findByRole('dialog', { name: 'ویرایش مردانه' });
    expect(screen.getByLabelText('نام فارسی')).toHaveValue('مردانه');
    expect(screen.getByLabelText('اسلاگ')).toHaveValue('apparel-men');

    await user.clear(screen.getByLabelText('نام فارسی'));
    await user.type(screen.getByLabelText('نام فارسی'), 'مردانه بزرگسال');
    await user.click(within(dialog).getByRole('button', { name: 'ذخیره' }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({
      method: 'PATCH',
      url: '/api/admin/categories/cat-men',
      body: { nameFa: 'مردانه بزرگسال', nameEn: 'Men', slug: 'apparel-men', parentId: 'cat-root' },
    });
  });
});

describe('AdminCategories — deactivate / reactivate', () => {
  it('deactivates after a confirm dialog that explains historical lots stay linked', async () => {
    const user = userEvent.setup();
    const writes = mockTree();
    render(<AdminCategories />, { wrapper: createWrapper() });

    await user.click(await screen.findByRole('button', { name: 'غیرفعال‌سازی پوشاک' }));
    const dialog = await screen.findByRole('dialog', { name: 'غیرفعال‌سازی دسته' });
    expect(dialog).toHaveTextContent('لات‌های تاریخی');

    await user.click(within(dialog).getByRole('button', { name: 'غیرفعال‌سازی' }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({
      method: 'PATCH',
      url: '/api/admin/categories/cat-root',
      body: { isActive: false },
    });
  });

  it('reactivates an inactive category through the same dialog pattern', async () => {
    const user = userEvent.setup();
    const writes = mockTree();
    render(<AdminCategories />, { wrapper: createWrapper() });

    await user.click(await screen.findByRole('button', { name: 'فعال‌سازی بچگانه' }));
    const dialog = await screen.findByRole('dialog', { name: 'فعال‌سازی دسته' });
    await user.click(within(dialog).getByRole('button', { name: 'فعال‌سازی' }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({
      method: 'PATCH',
      url: '/api/admin/categories/cat-hidden',
      body: { isActive: true },
    });
  });
});

describe('AdminCategories — reorder', () => {
  it('moves a root up by swapping with the previous sibling', async () => {
    const user = userEvent.setup();
    const writes = mockTree();
    render(<AdminCategories />, { wrapper: createWrapper() });

    await user.click(await screen.findByRole('button', { name: 'انتقال کفش به بالا' }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({
      method: 'PATCH',
      url: '/api/admin/categories/cat-shoes/reorder',
      body: { siblingId: 'cat-root' },
    });
  });

  it('moves a child down within its parent', async () => {
    const user = userEvent.setup();
    const writes = mockTree();
    render(<AdminCategories />, { wrapper: createWrapper() });

    await user.click(await screen.findByRole('button', { name: 'انتقال مردانه به پایین' }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({
      method: 'PATCH',
      url: '/api/admin/categories/cat-men/reorder',
      body: { siblingId: 'cat-hidden' },
    });
  });
});
