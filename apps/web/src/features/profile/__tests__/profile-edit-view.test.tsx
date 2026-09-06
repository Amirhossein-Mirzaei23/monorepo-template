import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ProfileResponseDto } from '@monorepo/shared-types';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  usePathname: () => '/settings/profile',
}));

import { ToastProvider } from '@/components/ui/toast';
import { AuthProvider } from '@/providers/auth-provider';
import { ProfileEditView } from '../components/profile-edit-view';

/**
 * PROF-001 component tests: prefill from GET /profiles/me, the edit → PATCH →
 * invalidate round-trip, add-only role semantics, metrics placeholders and
 * the avatar slot — all against a mocked BFF (`global.fetch`).
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
  { id: 'cat-beauty', nameFa: 'زیبایی و بهداشتی', nameEn: null, slug: 'beauty', children: [] },
];

const placeholderMetrics = {
  successfulTransactions: 0,
  averageRating: null,
  ratingCount: 0,
  responseRateMinutes: null,
  cancellationRate: null,
  activeListings: 0,
};

/** Full ProfileResponseDto fixtures (generated schema shape — see schema.zod.ts). */
const sellerProfile: ProfileResponseDto = {
  id: 'profile-1',
  userId: 'user-1',
  displayName: 'مینا رضایی',
  businessName: 'تولیدی پوشاک مینا',
  province: 'tehran',
  city: 'tehran',
  bio: 'تولید و عرضه عمده پوشاک',
  instagram: 'mina.apparel',
  website: null,
  isBuyer: false,
  isSeller: true,
  sellerYearsActive: 6,
  sellerBusinessType: 'MANUFACTURER',
  sellerDescription: null,
  interests: [{ id: 'cat-apparel-men', nameFa: 'مردانه', slug: 'apparel-men' }],
  verificationBadges: [],
  metrics: placeholderMetrics,
  onboardingCompleted: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const buyerProfile = {
  ...sellerProfile,
  id: 'profile-2',
  userId: 'user-2',
  displayName: 'آرمان تهرانی',
  businessName: null,
  isBuyer: true,
  isSeller: false,
  sellerYearsActive: null,
  sellerBusinessType: null,
  bio: null,
  instagram: null,
  interests: [],
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

/** Stateful BFF mock: GET returns `current`, PATCH swaps `current` for the echo. */
function mockBff(initialProfile: ProfileResponseDto, patchStatus = 200) {
  let current = initialProfile;
  global.fetch = jest.fn(async (input: unknown, init?: RequestInit) => {
    const path = String(input);
    if (path.includes('/api/categories')) {
      return jsonResponse(categoryTree);
    }
    if (path.includes('/api/auth/refresh')) {
      return jsonResponse({
        accessToken: 'test-access-token',
        user: {
          id: initialProfile.userId,
          phone: '09120000001',
          email: null,
          name: 'Test User',
          role: 'USER',
          status: 'ACTIVE',
          accountRoles: initialProfile.isSeller ? ['SELLER'] : ['BUYER'],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      });
    }
    if (path.includes('/api/profiles/me')) {
      if (init?.method === 'PATCH') {
        if (patchStatus !== 200) {
          return jsonResponse(
            { statusCode: patchStatus, error: 'Bad Request', message: 'businessName is required' },
            patchStatus,
          );
        }
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        current = {
          ...current,
          ...(typeof body.displayName === 'string' ? { displayName: body.displayName } : {}),
          ...(body.isSeller === true ? { isSeller: true } : {}),
          ...(typeof body.businessName === 'string' ? { businessName: body.businessName } : {}),
          updatedAt: '2026-02-01T00:00:00.000Z',
        };
        return jsonResponse(current);
      }
      return jsonResponse(current);
    }
    return jsonResponse({ statusCode: 404, error: 'Not Found', message: 'not found' }, 404);
  }) as typeof fetch;
}

function renderView() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <ProfileEditView />
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const patchCalls = () =>
  (global.fetch as jest.Mock).mock.calls.filter(
    (call) => String(call[0]).includes('/api/profiles/me') && call[1]?.method === 'PATCH',
  ) as Array<[string, RequestInit]>;

const getCalls = () =>
  (global.fetch as jest.Mock).mock.calls.filter(
    (call) => String(call[0]).includes('/api/profiles/me') && call[1]?.method !== 'PATCH',
  );

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ProfileEditView', () => {
  it('prefills the form from GET /profiles/me (identity, seller extras, links, interests)', async () => {
    mockBff(sellerProfile);
    renderView();

    expect(await screen.findByDisplayValue('مینا رضایی')).toBeInTheDocument();
    expect(screen.getByLabelText('نام کسب‌وکار')).toHaveValue('تولیدی پوشاک مینا');
    expect(screen.getByLabelText('استان')).toHaveValue('tehran');
    expect(screen.getByLabelText('شهر')).toHaveValue('tehran');
    expect(screen.getByLabelText('درباره شما (اختیاری)')).toHaveValue('تولید و عرضه عمده پوشاک');
    expect(screen.getByLabelText('سابقه فعالیت (سال)')).toHaveValue('6');
    expect(screen.getByLabelText('نوع کسب‌وکار')).toHaveValue('MANUFACTURER');
    expect(screen.getByLabelText('اینستاگرام (اختیاری)')).toHaveValue('mina.apparel');
    // Interests chips reflect the saved set.
    expect(await screen.findByRole('button', { name: 'پوشاک › مردانه' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // Held role is locked (add-only semantics), the other one is addable.
    expect(screen.getByRole('button', { name: /فروشنده/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /خریدار/ })).toBeEnabled();
  });

  it('renders the read-only trust metrics placeholders and the avatar slot', async () => {
    mockBff(sellerProfile);
    renderView();

    await screen.findByDisplayValue('مینا رضایی');
    expect(screen.getByText('شاخص‌های اعتماد')).toBeInTheDocument();
    expect(screen.getByText('معاملات موفق')).toBeInTheDocument();
    expect(screen.getByText('میانگین امتیاز')).toBeInTheDocument();
    expect(screen.getByText('آگهی‌های فعال')).toBeInTheDocument();
    // Counts → ۰, averages/rates → «—».
    expect(screen.getAllByText('۰')).toHaveLength(3);
    expect(screen.getAllByText('—')).toHaveLength(3);
    expect(screen.getByLabelText('تصویر پروفایل — به‌زودی')).toBeInTheDocument();
  });

  it('saves an edit via PATCH, toasts, and refetches so the form reflects the saved state', async () => {
    const user = userEvent.setup();
    mockBff(sellerProfile);
    renderView();

    const displayName = await screen.findByDisplayValue('مینا رضایی');
    const initialGets = getCalls().length;
    await user.clear(displayName);
    await user.type(displayName, 'مینا ویرایش‌شده');
    await user.click(screen.getByRole('button', { name: 'ذخیره تغییرات' }));

    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    const [, init] = patchCalls()[0] as [string, RequestInit];
    const payload = JSON.parse(String(init.body));
    expect(payload).toMatchObject({
      displayName: 'مینا ویرایش‌شده',
      businessName: 'تولیدی پوشاک مینا',
      province: 'tehran',
      city: 'tehran',
      instagram: 'mina.apparel',
      website: null,
      interests: ['cat-apparel-men'],
      sellerYearsActive: 6,
      sellerBusinessType: 'MANUFACTURER',
    });
    // Roles are add-only: a held hat is never re-sent, `false` never goes out.
    expect(payload).not.toHaveProperty('isSeller');
    expect(payload).not.toHaveProperty('isBuyer');

    expect(await screen.findByText('تغییرات پروفایل ذخیره شد')).toBeInTheDocument();
    // Invalidation → refetch (the mechanism behind "reflects immediately").
    await waitFor(() => expect(getCalls().length).toBeGreaterThan(initialGets));
    expect(screen.getByDisplayValue('مینا ویرایش‌شده')).toBeInTheDocument();
  });

  it('adds the seller hat (add-only) and requires a business name before saving', async () => {
    const user = userEvent.setup();
    mockBff(buyerProfile);
    renderView();

    await screen.findByDisplayValue('آرمان تهرانی');
    expect(screen.queryByLabelText('نام کسب‌وکار')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /خریدار/ })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /فروشنده/ }));
    expect(screen.getByText('افزوده می‌شود')).toBeInTheDocument();
    // Seller-only fields appear once the hat is added.
    expect(screen.getByLabelText('نام کسب‌وکار')).toBeInTheDocument();
    expect(screen.getByLabelText('سابقه فعالیت (سال)')).toBeInTheDocument();

    // Inline validation blocks the save without a business name.
    await user.click(screen.getByRole('button', { name: 'ذخیره تغییرات' }));
    expect(screen.getByText('نام کسب‌وکار برای فروشندگان الزامی است')).toBeInTheDocument();
    expect(patchCalls()).toHaveLength(0);

    await user.type(screen.getByLabelText('نام کسب‌وکار'), 'کسب‌وکار آرمان');
    await user.click(screen.getByRole('button', { name: 'ذخیره تغییرات' }));

    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    const payload = JSON.parse(String((patchCalls()[0] as [string, RequestInit])[1].body));
    expect(payload).toMatchObject({ isSeller: true, businessName: 'کسب‌وکار آرمان' });
    expect(payload).not.toHaveProperty('isBuyer');
  });

  it('shows an error toast when the PATCH fails and keeps the edits', async () => {
    const user = userEvent.setup();
    mockBff(sellerProfile, 400);
    renderView();

    const displayName = await screen.findByDisplayValue('مینا رضایی');
    await user.clear(displayName);
    await user.type(displayName, 'مینا ناموفق');
    await user.click(screen.getByRole('button', { name: 'ذخیره تغییرات' }));

    expect(await screen.findByText(/ذخیره تغییرات ناموفق بود/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('مینا ناموفق')).toBeInTheDocument();
  });

  it('shows inline errors for an invalid display name and does not call the API', async () => {
    const user = userEvent.setup();
    mockBff(sellerProfile);
    renderView();

    const displayName = await screen.findByDisplayValue('مینا رضایی');
    await user.clear(displayName);
    await user.type(displayName, 'آ');
    await user.click(screen.getByRole('button', { name: 'ذخیره تغییرات' }));

    expect(screen.getByText('نام نمایشی باید حداقل ۳ نویسه باشد')).toBeInTheDocument();
    expect(patchCalls()).toHaveLength(0);
  });
});
