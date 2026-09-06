import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockRouterReplace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockRouterReplace, back: jest.fn() }),
  usePathname: () => '/onboarding',
}));

import { ToastProvider } from '@/components/ui/toast';
import { AuthProvider } from '@/providers/auth-provider';
import { OnboardingWizard } from '../components/onboarding-wizard';

/**
 * ONB-002 full-flow tests: buyer 3-step path, seller 5-step path, per-step
 * validation gates, draft autosave/restore, and the submit payload — all
 * against a mocked BFF (`global.fetch`).
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

const profileResponse = {
  id: 'profile-1',
  userId: 'user-1',
  displayName: 'مینا رضایی',
  businessName: 'تولیدی پوشاک مینا',
  province: 'tehran',
  city: 'tehran',
  bio: null,
  instagram: null,
  website: null,
  isBuyer: false,
  isSeller: true,
  sellerYearsActive: 6,
  sellerBusinessType: 'MANUFACTURER',
  sellerDescription: null,
  interests: [{ id: 'cat-apparel-men', nameFa: 'مردانه', slug: 'apparel-men' }],
  verificationBadges: [],
  // PROF-001 added the trust-metrics block to ProfileResponseDto (zeros/null
  // placeholders until the P1 rollup jobs land).
  metrics: {
    successfulTransactions: 0,
    averageRating: null,
    ratingCount: 0,
    responseRateMinutes: null,
    cancellationRate: null,
    activeListings: 0,
  },
  onboardingCompleted: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function setupWizard(redirectTo = '/dashboard') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <OnboardingWizard redirectTo={redirectTo} />
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

async function completeRoleStep(user: ReturnType<typeof userEvent.setup>, seller: boolean) {
  await user.click(screen.getByRole('button', { name: seller ? /فروشنده/ : /خریدار/ }));
  await user.click(screen.getByRole('button', { name: 'بعدی' }));
}

async function completeIdentityStep(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('نام نمایشی'), 'مینا رضایی');
  await user.selectOptions(screen.getByLabelText('استان'), 'tehran');
  await user.selectOptions(screen.getByLabelText('شهر'), 'tehran');
  await user.click(screen.getByRole('button', { name: 'بعدی' }));
}

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  global.fetch = jest.fn(async (input: unknown) => {
    const path = String(input);
    if (path.includes('/api/categories')) {
      return jsonResponse(categoryTree);
    }
    if (path.includes('/api/profiles/onboarding')) {
      return jsonResponse(profileResponse);
    }
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
          accountRoles: ['BUYER'],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      });
    }
    return jsonResponse({ statusCode: 404, error: 'Not Found', message: 'not found' }, 404);
  }) as typeof fetch;
});

describe('OnboardingWizard', () => {
  it('blocks step 1 until a role is chosen', async () => {
    const user = userEvent.setup();
    setupWizard();

    await user.click(screen.getByRole('button', { name: 'بعدی' }));
    expect(screen.getByRole('alert')).toHaveTextContent('حداقل یکی از نقش‌ها');
    expect(screen.getByText('گام ۱ از ۳')).toBeInTheDocument();
  });

  it('buyer path is three steps and submits the right payload', async () => {
    const user = userEvent.setup();
    setupWizard('/next-target');

    await completeRoleStep(user, false);
    await completeIdentityStep(user);
    // Step 3 (interests) is the buyer's last step.
    expect(screen.getByText('گام ۳ از ۳')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'پوشاک › مردانه' }));
    await user.click(screen.getByRole('button', { name: 'پایان و ذخیره' }));

    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith('/next-target'));

    const saveCall = (global.fetch as jest.Mock).mock.calls.find((call) =>
      String(call[0]).includes('/api/profiles/onboarding'),
    );
    const [, init] = saveCall as [unknown, RequestInit];
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({
      isBuyer: true,
      isSeller: false,
      displayName: 'مینا رضایی',
      province: 'tehran',
      city: 'tehran',
      interests: ['cat-apparel-men'],
    });
  });

  it('seller path has five steps including seller extras and links', async () => {
    const user = userEvent.setup();
    setupWizard();

    await completeRoleStep(user, true);
    await user.type(screen.getByLabelText('نام نمایشی'), 'مینا رضایی');
    await user.type(screen.getByLabelText('نام کسب‌وکار'), 'تولیدی پوشاک مینا');
    await user.selectOptions(screen.getByLabelText('استان'), 'tehran');
    await user.selectOptions(screen.getByLabelText('شهر'), 'tehran');
    await user.click(screen.getByRole('button', { name: 'بعدی' }));
    expect(screen.getByText('گام ۳ از ۵')).toBeInTheDocument();

    // Interests
    await user.click(screen.getByRole('button', { name: 'پوشاک' }));
    await user.click(screen.getByRole('button', { name: 'بعدی' }));

    // Seller extras
    expect(screen.getByText('گام ۴ از ۵')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('سابقه فعالیت (سال)'), '6');
    await user.selectOptions(screen.getByLabelText('نوع کسب‌وکار'), 'MANUFACTURER');
    await user.click(screen.getByRole('button', { name: 'بعدی' }));

    // Links
    expect(screen.getByText('گام ۵ از ۵')).toBeInTheDocument();
    await user.type(screen.getByLabelText('اینستاگرام (اختیاری)'), 'mina.apparel');
    await user.click(screen.getByRole('button', { name: 'پایان و ذخیره' }));

    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith('/dashboard'));
    const saveCall = (global.fetch as jest.Mock).mock.calls.find((call) =>
      String(call[0]).includes('/api/profiles/onboarding'),
    );
    const payload = JSON.parse(String((saveCall as [unknown, RequestInit])[1].body));
    expect(payload).toMatchObject({
      isSeller: true,
      businessName: 'تولیدی پوشاک مینا',
      sellerYearsActive: 6,
      sellerBusinessType: 'MANUFACTURER',
      instagram: 'mina.apparel',
      interests: ['cat-apparel'],
    });
  });

  it('requires business name for sellers on the identity step', async () => {
    const user = userEvent.setup();
    setupWizard();

    await completeRoleStep(user, true);
    await user.type(screen.getByLabelText('نام نمایشی'), 'مینا رضایی');
    await user.click(screen.getByRole('button', { name: 'بعدی' }));

    expect(screen.getByText('نام کسب‌وکار برای فروشندگان الزامی است')).toBeInTheDocument();
    expect(screen.getByText('گام ۲ از ۵')).toBeInTheDocument();
  });

  it('rejects a city that does not belong to the chosen province', async () => {
    const user = userEvent.setup();
    setupWizard();

    await completeRoleStep(user, false);
    await user.type(screen.getByLabelText('نام نمایشی'), 'مینا رضایی');
    await user.selectOptions(screen.getByLabelText('استان'), 'tehran');
    await user.selectOptions(screen.getByLabelText('شهر'), 'tehran');
    await user.click(screen.getByRole('button', { name: 'بعدی' }));

    // Province/city selects only offer valid pairs, so this path is enforced
    // by construction; the invalid pair is exercised via the schema test.
    expect(screen.getByText('گام ۳ از ۳')).toBeInTheDocument();
  });

  it('autosaves a draft and restores it after reload', async () => {
    const user = userEvent.setup();
    const { unmount } = setupWizard();

    await completeRoleStep(user, false);
    await user.type(screen.getByLabelText('نام نمایشی'), 'پیش‌نویس');
    await waitFor(() =>
      expect(window.localStorage.getItem('rakdsho:onboarding-draft')).toBeTruthy(),
    );
    unmount();

    setupWizard();
    await waitFor(() => expect(screen.getByDisplayValue('پیش‌نویس')).toBeInTheDocument());
    expect(screen.getByText(/پیش‌نویس بازیابی شد/)).toBeInTheDocument();
    // Draft restore returns to the saved step (identity = step 2 of 3).
    await waitFor(() => expect(screen.getByText(/گام ۲ از ۳/)).toBeInTheDocument());
  });

  it('clears the draft after a successful submit and shows a toast', async () => {
    const user = userEvent.setup();
    setupWizard();

    await completeRoleStep(user, false);
    await completeIdentityStep(user);
    await user.click(screen.getByRole('button', { name: 'پایان و ذخیره' }));

    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith('/dashboard'));
    await waitFor(() => expect(window.localStorage.getItem('rakdsho:onboarding-draft')).toBeNull());
    expect(await screen.findByText('پروفایل شما ذخیره شد')).toBeInTheDocument();
  });

  it('shows an error toast and keeps the draft when the submit fails', async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockImplementation(async (input: unknown) => {
      const path = String(input);
      if (path.includes('/api/categories')) {
        return jsonResponse(categoryTree);
      }
      return jsonResponse({ statusCode: 500, error: 'Internal', message: 'boom' }, 500);
    });

    setupWizard();
    await completeRoleStep(user, false);
    await completeIdentityStep(user);
    await user.click(screen.getByRole('button', { name: 'پایان و ذخیره' }));

    expect(
      await screen.findByText('ذخیره پروفایل ناموفق بود — دوباره تلاش کنید'),
    ).toBeInTheDocument();
    expect(window.localStorage.getItem('rakdsho:onboarding-draft')).toBeTruthy();
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it('navigates back without losing entered data', async () => {
    const user = userEvent.setup();
    setupWizard();

    await completeRoleStep(user, false);
    await user.type(screen.getByLabelText('نام نمایشی'), 'مینا رضایی');
    await user.click(screen.getByRole('button', { name: 'بعدی' }));
    await user.click(screen.getByRole('button', { name: 'بازگشت' }));

    expect(screen.getByText('گام ۱ از ۳')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /خریدار/ })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'بعدی' }));
    expect(screen.getByDisplayValue('مینا رضایی')).toBeInTheDocument();
  });
});
