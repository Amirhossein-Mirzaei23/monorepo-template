import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockRouterReplace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockRouterReplace, back: jest.fn() }),
  usePathname: () => '/dashboard/lots/new',
}));

import { ToastProvider } from '@/components/ui/toast';
import { AuthProvider } from '@/providers/auth-provider';
import { CreateLotWizard } from '../components/create-lot-wizard';
import { CATEGORY_TREE, LOT_MEDIA_ROW, ownerLotFixture } from '../testing/fixtures';

/**
 * LOT-004 wizard flow tests (mocked BFF): the five-step new-lot happy path
 * (submit + draft), the unit-price preview on the pricing step, localStorage
 * draft autosave/resume for NEW lots, the media-attach choreography (POST
 * DRAFT → PUT media → PATCH submit:true, with a failed media PUT aborting the
 * submit), and the edit-mode matrix — DRAFT full edit with debounced autosave
 * PATCH and media PUT before PATCH, REJECTED resubmit with the reason banner,
 * ACTIVE/PAUSED pricing-only edit, and read-only statuses.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function calls(): Array<{ path: string; method: string; body: unknown }> {
  return (global.fetch as jest.Mock).mock.calls.map(([input, init]) => {
    const recordInit = (init ?? {}) as RequestInit;
    return {
      path: String(input),
      method: (recordInit.method ?? 'GET').toUpperCase(),
      body: recordInit.body !== undefined ? JSON.parse(String(recordInit.body)) : undefined,
    };
  });
}

function findCall(pathPart: string, method: string) {
  return calls().find((call) => call.path.includes(pathPart) && call.method === method);
}

function renderWizard(lotId?: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <CreateLotWizard {...(lotId !== undefined ? { lotId } : {})} />
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

async function fillBasics(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByLabelText('عنوان آگهی'), 'عمده پیراهن مردانه — ۵۰ عدد');
  await user.type(screen.getByLabelText('توضیحات'), 'توضیحات کامل کالا، جنس و شرایط فروش');
  await user.click(screen.getByRole('button', { name: 'بعدی' }));
}

async function fillPricing(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByLabelText('قیمت کل (تومان)'), '112500000');
  await user.type(screen.getByLabelText('تعداد کل'), '50');
  // Live unit-price preview mirrors the API's derived unitPrice (112500000/50).
  expect(screen.getByTestId('unit-price-preview').textContent).toBe(
    'قیمت هر واحد: ~۲٬۲۵۰٬۰۰۰ تومان',
  );
  await user.type(screen.getByLabelText('موجودی قابل فروش'), '50');
  await user.type(screen.getByLabelText('حداقل سفارش'), '10');
  await user.click(screen.getByRole('button', { name: 'بعدی' }));
}

async function fillClassification(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.selectOptions(screen.getByLabelText('دسته‌بندی'), 'cat-apparel');
  await user.selectOptions(screen.getByLabelText('زیر‌دسته'), 'cat-apparel-men');
  await user.selectOptions(screen.getByLabelText('وضعیت کالا'), 'GRADE_A');
  await user.selectOptions(screen.getByLabelText('دلیل این فروش'), 'OVERSTOCK');
  await user.selectOptions(screen.getByLabelText('استان'), 'tehran');
  await user.selectOptions(screen.getByLabelText('شهر'), 'tehran');
  await user.type(screen.getByLabelText('موقعیت تقریبی (اختیاری)'), 'بازار بزرگ تهران');
  await user.click(screen.getByRole('button', { name: 'بعدی' }));
}

function mockApi(
  options: {
    lot?: unknown;
    postStatus?: number;
    postBody?: unknown;
    mediaStatus?: number;
    mediaBody?: unknown;
  } = {},
): void {
  global.fetch = jest.fn(async (input: unknown, init?: RequestInit) => {
    const path = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    if (path.includes('/api/auth/refresh')) {
      return jsonResponse({
        accessToken: 'test-access-token',
        user: {
          id: 'user-1',
          phone: '09120000001',
          email: null,
          name: 'Test User',
          role: 'USER',
          status: 'ACTIVE',
          accountRoles: ['SELLER'],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      });
    }
    if (path === '/api/categories') {
      return jsonResponse(CATEGORY_TREE);
    }
    if (path === '/api/lots' && method === 'POST') {
      return jsonResponse(options.postBody ?? ownerLotFixture(), options.postStatus ?? 201);
    }
    if (path.includes('/api/lots/lot-1/media') && method === 'PUT') {
      const status = options.mediaStatus ?? 200;
      if (status >= 300) {
        return jsonResponse(
          options.mediaBody ?? {
            statusCode: status,
            error: 'Conflict',
            message: 'Media attach failed',
          },
          status,
        );
      }
      return jsonResponse(options.lot ?? ownerLotFixture());
    }
    if (path === '/api/lots/lot-1') {
      if (method === 'GET') {
        return jsonResponse(options.lot ?? ownerLotFixture());
      }
      if (method === 'PATCH') {
        return jsonResponse(options.lot ?? ownerLotFixture());
      }
    }
    return jsonResponse({ statusCode: 404, error: 'Not Found', message: 'Not found' }, 404);
  }) as typeof fetch;
}

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  mockApi();
});

describe('CreateLotWizard — new lot', () => {
  it('completes the five-step happy path: POST submit:false → PATCH submit:true, no media PUT, «در انتظار بررسی» state', async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByRole('button', { name: 'بعدی' })); // step 1: media (optional)
    await fillBasics(user);
    await fillPricing(user);
    await fillClassification(user);
    expect(screen.getByText('گام ۵ از ۵')).toBeInTheDocument();
    expect(screen.getByText('عمده پیراهن مردانه — ۵۰ عدد')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'ارسال برای بررسی' }));
    await waitFor(() =>
      expect(screen.getByText('آگهی شما در انتظار بررسی است')).toBeInTheDocument(),
    );

    const post = findCall('/api/lots', 'POST');
    expect(post).toBeDefined();
    expect(post?.body).toMatchObject({
      submit: false,
      title: 'عمده پیراهن مردانه — ۵۰ عدد',
      description: 'توضیحات کامل کالا، جنس و شرایط فروش',
      categoryId: 'cat-apparel',
      subcategoryId: 'cat-apparel-men',
      totalPrice: 112500000,
      quantity: 50,
      availableQuantity: 50,
      minOrderQuantity: 10,
      unit: 'PIECE',
      pricingType: 'NEGOTIABLE',
      condition: 'GRADE_A',
      liquidationReason: 'OVERSTOCK',
      province: 'tehran',
      city: 'tehran',
    });
    // The submit intent rides a trailing PATCH (DRAFT → PENDING_REVIEW) so the
    // media PUT stays legal between the two.
    const patch = findCall('/api/lots/lot-1', 'PATCH');
    expect(patch?.body).toMatchObject({ submit: true });
    // No media pending → the media PUT must not fire.
    expect(findCall('/media', 'PUT')).toBeUndefined();
  });

  it('saves a draft: POST submit:false, clears the local draft, continues on the edit route', async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByRole('button', { name: 'بعدی' }));
    await fillBasics(user);
    await fillPricing(user);
    await fillClassification(user);
    await user.click(screen.getByRole('button', { name: 'ذخیره پیش‌نویس' }));

    await waitFor(() =>
      expect(mockRouterReplace).toHaveBeenCalledWith('/dashboard/lots/lot-1/edit'),
    );
    const post = findCall('/api/lots', 'POST');
    expect(post?.body).toMatchObject({ submit: false });
    expect(window.localStorage.getItem('rakdsho:lot-draft')).toBeNull();
    expect(await screen.findByText('پیش‌نویس ذخیره شد')).toBeInTheDocument();
  });

  it('blocks the basics step with inline Persian errors until valid', async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByRole('button', { name: 'بعدی' })); // media
    await user.click(screen.getByRole('button', { name: 'بعدی' })); // basics, empty

    expect(screen.getByText('عنوان باید حداقل ۵ نویسه باشد')).toBeInTheDocument();
    expect(screen.getByText('گام ۲ از ۵')).toBeInTheDocument();
  });

  it('autosaves the unsaved new-lot draft to localStorage and resumes it', async () => {
    const user = userEvent.setup();
    const { unmount } = renderWizard();

    await user.click(screen.getByRole('button', { name: 'بعدی' })); // media
    await user.type(screen.getByLabelText('عنوان آگهی'), 'عمده پیراهن مردانه');
    await waitFor(() => expect(window.localStorage.getItem('rakdsho:lot-draft')).toBeTruthy());
    unmount();

    renderWizard();
    expect(await screen.findByDisplayValue('عمده پیراهن مردانه')).toBeInTheDocument();
    expect(screen.getByText(/پیش‌نویس بازیابی شد/)).toBeInTheDocument();
    expect(screen.getByText(/گام ۲ از ۵/)).toBeInTheDocument();
  });

  it('create + submit with pending media: POST (submit:false) → PUT media → PATCH submit:true, in order', async () => {
    window.localStorage.setItem(
      'rakdsho:lot-draft',
      JSON.stringify({
        step: 0,
        data: {},
        media: [
          {
            key: 'media-1',
            kind: 'image',
            id: 'asset-1',
            url: 'http://localhost:3001/media/2026/09/asset-1.jpg',
            thumbUrl: 'http://localhost:3001/media/2026/09/asset-1t.webp',
            status: 'ready',
          },
        ],
      }),
    );
    const user = userEvent.setup();
    renderWizard();

    // The ready tile hydrated from the draft (index 0 = cover).
    expect(await screen.findByRole('img', { name: 'تصویر ۱' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'بعدی' }));
    await fillBasics(user);
    await fillPricing(user);
    await fillClassification(user);
    await user.click(screen.getByRole('button', { name: 'ارسال برای بررسی' }));

    await waitFor(() =>
      expect(screen.getByText('آگهی شما در انتظار بررسی است')).toBeInTheDocument(),
    );

    // Media is only attachable while the lot is editable — it must land
    // between the DRAFT POST and the submit PATCH.
    const lotCalls = calls().filter(
      (call) => call.path.includes('/api/lots') && call.method !== 'GET',
    );
    expect(lotCalls.map((call) => call.method)).toEqual(['POST', 'PUT', 'PATCH']);
    const post = lotCalls.find((call) => call.method === 'POST');
    const put = lotCalls.find((call) => call.method === 'PUT');
    const patch = lotCalls.find((call) => call.method === 'PATCH');
    if (!post || !put || !patch) {
      throw new Error('expected POST → PUT → PATCH against /api/lots');
    }
    expect(post.body).toMatchObject({ submit: false });
    expect(put.path).toContain('/api/lots/lot-1/media');
    expect(put.body).toEqual({ items: [{ mediaAssetId: 'asset-1' }], coverIndex: 0 });
    expect(patch.body).toMatchObject({ submit: true });
  });

  it('create + submit: a failed media PUT aborts submission — the lot stays a DRAFT (no submit PATCH)', async () => {
    window.localStorage.setItem(
      'rakdsho:lot-draft',
      JSON.stringify({
        step: 0,
        data: {},
        media: [
          {
            key: 'media-1',
            kind: 'image',
            id: 'asset-1',
            url: 'http://localhost:3001/media/2026/09/asset-1.jpg',
            thumbUrl: 'http://localhost:3001/media/2026/09/asset-1t.webp',
            status: 'ready',
          },
        ],
      }),
    );
    mockApi({
      mediaStatus: 409,
      mediaBody: {
        statusCode: 409,
        error: 'Conflict',
        message: 'ILLEGAL_STATUS_EDIT',
        code: 'ILLEGAL_STATUS_EDIT',
      },
    });
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByRole('button', { name: 'بعدی' }));
    await fillBasics(user);
    await fillPricing(user);
    await fillClassification(user);
    await user.click(screen.getByRole('button', { name: 'ارسال برای بررسی' }));

    await waitFor(() => expect(findCall('/media', 'PUT')).toBeDefined());
    expect(
      await screen.findByText(
        'ذخیره رسانه‌ها ناموفق بود — آگهی به‌صورت پیش‌نویس باقی ماند؛ از صفحه ویرایش دوباره تلاش کنید',
      ),
    ).toBeInTheDocument();
    // The POST materialized a DRAFT; the submit intent never fired.
    expect(findCall('/api/lots', 'POST')).toBeDefined();
    expect(findCall('/api/lots/lot-1', 'PATCH')).toBeUndefined();
    expect(screen.queryByText('آگهی شما در انتظار بررسی است')).not.toBeInTheDocument();
    // Retry affordance: the wizard moves to the draft's edit route.
    expect(mockRouterReplace).toHaveBeenCalledWith('/dashboard/lots/lot-1/edit');
  });

  it('redirects to /onboarding with a toast on SELLER_REQUIRED (403)', async () => {
    mockApi({
      postStatus: 403,
      postBody: {
        statusCode: 403,
        error: 'Forbidden',
        message: 'Seller account required',
        code: 'SELLER_REQUIRED',
      },
    });
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByRole('button', { name: 'بعدی' }));
    await fillBasics(user);
    await fillPricing(user);
    await fillClassification(user);
    await user.click(screen.getByRole('button', { name: 'ارسال برای بررسی' }));

    expect(await screen.findByText('برای ساخت آگهی ابتدا باید فروشنده شوید')).toBeInTheDocument();
    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith('/onboarding'));
  });
});

describe('CreateLotWizard — edit mode', () => {
  it('DRAFT: prefills owner data + gallery and PATCHes with submit=false (no media PUT when unchanged)', async () => {
    mockApi({ lot: ownerLotFixture({ media: [LOT_MEDIA_ROW] }) });
    const user = userEvent.setup();
    renderWizard('lot-1');

    expect(
      await screen.findByText('پیش‌نویس — تغییرات به‌طور خودکار ذخیره می‌شود.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'تصویر ۱' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'بعدی' }));
    expect(screen.getByDisplayValue('عمده پیراهن مردانه — ۵۰ عدد')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'بعدی' })); // pricing (valid as-is)
    await user.click(screen.getByRole('button', { name: 'بعدی' })); // classification
    await user.click(screen.getByRole('button', { name: 'بعدی' })); // review
    await user.click(screen.getByRole('button', { name: 'ذخیره پیش‌نویس' }));

    await waitFor(() => expect(findCall('/api/lots/lot-1', 'PATCH')).toBeDefined());
    const patch = findCall('/api/lots/lot-1', 'PATCH');
    expect(patch?.body).toMatchObject({ submit: false, title: 'عمده پیراهن مردانه — ۵۰ عدد' });
    // Gallery untouched → the media PUT must not fire.
    expect(findCall('/media', 'PUT')).toBeUndefined();
  });

  it('DRAFT: debounced silent autosave PATCH carries no submit flag', async () => {
    mockApi({ lot: ownerLotFixture() });
    const user = userEvent.setup();
    renderWizard('lot-1');

    expect(
      await screen.findByText('پیش‌نویس — تغییرات به‌طور خودکار ذخیره می‌شود.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'بعدی' }));
    await user.clear(screen.getByLabelText('عنوان آگهی'));
    await user.type(screen.getByLabelText('عنوان آگهی'), 'عنوان کاملاً تازه برای تست');

    await waitFor(
      () => {
        const patch = findCall('/api/lots/lot-1', 'PATCH');
        expect(patch).toBeDefined();
        expect(patch?.body).toMatchObject({ title: 'عنوان کاملاً تازه برای تست' });
        expect((patch?.body as Record<string, unknown>).submit).toBeUndefined();
      },
      { timeout: 4000 },
    );
  });

  it('edit (DRAFT) with a dirty gallery: PUT media FIRST, then the PATCH', async () => {
    mockApi({ lot: ownerLotFixture({ media: [LOT_MEDIA_ROW] }) });
    const user = userEvent.setup();
    renderWizard('lot-1');

    expect(
      await screen.findByText('پیش‌نویس — تغییرات به‌طور خودکار ذخیره می‌شود.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'تصویر ۱' })).toBeInTheDocument();

    // Dirty the gallery: remove the hydrated cover tile.
    await user.click(screen.getByRole('button', { name: 'حذف تصویر ۱' }));
    expect(screen.queryByRole('img', { name: 'تصویر ۱' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'بعدی' })); // basics
    await user.click(screen.getByRole('button', { name: 'بعدی' })); // pricing
    await user.click(screen.getByRole('button', { name: 'بعدی' })); // classification
    await user.click(screen.getByRole('button', { name: 'بعدی' })); // review
    await user.click(screen.getByRole('button', { name: 'ذخیره پیش‌نویس' }));

    await waitFor(() => expect(screen.getByText('پیش‌نویس ذخیره شد')).toBeInTheDocument());
    // DRAFT/REJECTED is the last moment media is editable — the PUT must land
    // before the PATCH.
    const lotCalls = calls().filter(
      (call) => call.path.includes('/api/lots') && call.method !== 'GET',
    );
    expect(lotCalls.map((call) => call.method)).toEqual(['PUT', 'PATCH']);
    const put = lotCalls.find((call) => call.method === 'PUT');
    const patch = lotCalls.find((call) => call.method === 'PATCH');
    if (!put || !patch) {
      throw new Error('expected PUT → PATCH against /api/lots');
    }
    expect(put.path).toContain('/api/lots/lot-1/media');
    expect(patch.body).toMatchObject({ submit: false });
  });

  it('edit (DRAFT): a failed media PUT aborts the PATCH — stays on the page with an error toast', async () => {
    mockApi({
      lot: ownerLotFixture({ media: [LOT_MEDIA_ROW] }),
      mediaStatus: 409,
      mediaBody: {
        statusCode: 409,
        error: 'Conflict',
        message: 'ILLEGAL_STATUS_EDIT',
        code: 'ILLEGAL_STATUS_EDIT',
      },
    });
    const user = userEvent.setup();
    renderWizard('lot-1');

    expect(
      await screen.findByText('پیش‌نویس — تغییرات به‌طور خودکار ذخیره می‌شود.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'حذف تصویر ۱' }));
    await user.click(screen.getByRole('button', { name: 'بعدی' }));
    await user.click(screen.getByRole('button', { name: 'بعدی' }));
    await user.click(screen.getByRole('button', { name: 'بعدی' }));
    await user.click(screen.getByRole('button', { name: 'بعدی' }));
    await user.click(screen.getByRole('button', { name: 'ذخیره پیش‌نویس' }));

    await waitFor(() => expect(findCall('/media', 'PUT')).toBeDefined());
    expect(
      await screen.findByText('ذخیره رسانه‌ها ناموفق بود — تغییرات ذخیره نشد؛ دوباره تلاش کنید'),
    ).toBeInTheDocument();
    // Aborted: no PATCH after the failed media PUT, no success toast.
    expect(findCall('/api/lots/lot-1', 'PATCH')).toBeUndefined();
    expect(screen.queryByText('پیش‌نویس ذخیره شد')).not.toBeInTheDocument();
  });

  it('REJECTED: shows the reason banner and resubmit moves it back to review', async () => {
    mockApi({
      lot: ownerLotFixture({
        status: 'REJECTED',
        rejectionReason: 'عکس‌ها کیفیت کافی ندارند',
      }),
    });
    const user = userEvent.setup();
    renderWizard('lot-1');

    expect(
      await screen.findByText('آگهی شما رد شده است — پس از اصلاح می‌توانید دوباره ارسال کنید.'),
    ).toBeInTheDocument();
    expect(screen.getByText('دلیل: عکس‌ها کیفیت کافی ندارند')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'بعدی' }));
    await user.click(screen.getByRole('button', { name: 'بعدی' }));
    await user.click(screen.getByRole('button', { name: 'بعدی' }));
    await user.click(screen.getByRole('button', { name: 'بعدی' }));
    await user.click(screen.getByRole('button', { name: 'ارسال برای بررسی' }));

    await waitFor(() =>
      expect(screen.getByText('آگهی شما در انتظار بررسی است')).toBeInTheDocument(),
    );
    const patch = findCall('/api/lots/lot-1', 'PATCH');
    expect(patch?.body).toMatchObject({ submit: true });
  });

  it('ACTIVE: pricing-only editor — locked fields absent, PATCH sends the price/quantity subset', async () => {
    mockApi({ lot: ownerLotFixture({ status: 'ACTIVE' }) });
    const user = userEvent.setup();
    renderWizard('lot-1');

    expect(await screen.findByText('قیمت و موجودی')).toBeInTheDocument();
    expect(
      screen.getByText('آگهی فعال است — فقط قیمت و موجودی قابل ویرایش است.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('عنوان آگهی')).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText('تعداد کل'));
    await user.type(screen.getByLabelText('تعداد کل'), '45');
    await user.clear(screen.getByLabelText('موجودی قابل فروش'));
    await user.type(screen.getByLabelText('موجودی قابل فروش'), '45');
    await user.click(screen.getByRole('button', { name: 'ذخیره تغییرات' }));

    await waitFor(() => expect(findCall('/api/lots/lot-1', 'PATCH')).toBeDefined());
    const patch = findCall('/api/lots/lot-1', 'PATCH');
    expect(Object.keys(patch?.body as object).sort()).toEqual([
      'availableQuantity',
      'minOrderQuantity',
      'quantity',
      'totalPrice',
    ]);
    expect(patch?.body).toMatchObject({ quantity: 45, availableQuantity: 45 });
    expect(findCall('/media', 'PUT')).toBeUndefined();
  });

  it('PENDING_REVIEW: read-only view with the Persian status banner and no save actions', async () => {
    mockApi({ lot: ownerLotFixture({ status: 'PENDING_REVIEW' }) });
    renderWizard('lot-1');

    expect(
      await screen.findByText(/در وضعیت «در انتظار بررسی» است و قابل ویرایش نیست/),
    ).toBeInTheDocument();
    expect(screen.getByText('عمده پیراهن مردانه — ۵۰ عدد')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ذخیره پیش‌نویس' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ارسال برای بررسی' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'بعدی' })).not.toBeInTheDocument();
  });
});
