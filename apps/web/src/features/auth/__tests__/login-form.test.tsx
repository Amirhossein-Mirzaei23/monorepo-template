import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockRouterPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush, replace: jest.fn(), back: jest.fn() }),
}));

import { ToastProvider } from '@/components/ui/toast';
import { AuthProvider } from '@/providers/auth-provider';
import { LoginForm } from '../components/login-form';

/**
 * AUTH-004 component tests: two-step transitions, fa→en normalization, the
 * 120s resend countdown (fake timers), error states, masked phone, edit-phone
 * and auto-submit — all against a mocked BFF (`global.fetch`).
 */

const validPhone = '09123456789';
const maskedPhone = '۰۹۱۲•••۶۷۸۹';

const otpRequestResponse = {
  expiresAt: '2026-01-01T00:02:00.000Z',
  devCode: '123456',
};

const otpVerifyResponse = {
  accessToken: 'header.payload.signature',
  user: {
    id: 'user-1',
    phone: validPhone,
    email: null,
    name: 'Jane Doe',
    role: 'USER',
    status: 'ACTIVE',
    accountRoles: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  onboardingCompleted: true,
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const fetchMock = jest.fn();

/** Default BFF mock: silent session-restore fails, OTP request succeeds. */
function defaultFetchMock(overrides: Record<string, (input: unknown) => Response> = {}) {
  fetchMock.mockImplementation(async (input) => {
    const path = String(input);
    const override = Object.keys(overrides).find((route) => path.includes(route));
    if (override) {
      return overrides[override]!(input);
    }
    if (path.includes('/api/auth/otp/request')) {
      return jsonResponse(otpRequestResponse);
    }
    return jsonResponse({ message: 'unauthenticated' }, 401);
  });
}

function renderLoginForm(redirectTo = '/dashboard') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <LoginForm redirectTo={redirectTo} />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

/** Steps through to the code screen: types the phone, clicks the CTA. */
async function goToCodeStep(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('شماره موبایل'), validPhone);
  await user.click(screen.getByRole('button', { name: 'دریافت کد ورود' }));
  await screen.findByLabelText('کد تأیید');
}

describe('LoginForm (step 1 — phone)', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    mockRouterPush.mockReset();
    defaultFetchMock();
    global.fetch = fetchMock as unknown as typeof global.fetch;
  });

  it('renders the labelled phone field with the format hint', () => {
    renderLoginForm();
    expect(screen.getByLabelText('شماره موبایل')).toBeInTheDocument();
    expect(screen.getByText('شماره با فرمت ۰۹XXXXXXXXX وارد شود')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'دریافت کد ورود' })).toHaveAttribute(
      'type',
      'submit',
    );
  });

  it('normalizes Persian digits to English while typing', async () => {
    const user = userEvent.setup();
    renderLoginForm();
    await user.type(screen.getByLabelText('شماره موبایل'), '۰۹۱۲۳۴۵۶۷۸۹');
    expect(screen.getByLabelText('شماره موبایل')).toHaveValue(validPhone);
  });

  it('shows an inline schema error and skips the BFF for an invalid phone', async () => {
    const user = userEvent.setup();
    renderLoginForm();
    await user.type(screen.getByLabelText('شماره موبایل'), '12345');
    await user.click(screen.getByRole('button', { name: 'دریافت کد ورود' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'شماره موبایل را با فرمت ۰۹XXXXXXXXX وارد کنید',
    );
    expect(fetchMock).not.toHaveBeenCalledWith('/api/auth/otp/request', expect.anything());
  });

  it('moves to the code step with a masked phone and edit-phone link', async () => {
    const user = userEvent.setup();
    renderLoginForm();
    await goToCodeStep(user);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/otp/request',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(screen.getByText(maskedPhone)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ویرایش شماره' })).toBeInTheDocument();
    expect(screen.getByLabelText('کد تأیید')).toHaveAttribute('autocomplete', 'one-time-code');
  });

  it('shows a dismissible dev-mode hint when the BFF returns devCode', async () => {
    const user = userEvent.setup();
    renderLoginForm();
    await goToCodeStep(user);

    const hint = screen.getByText('حالت توسعه فعال است — کد ورود:');
    expect(hint).toBeInTheDocument();
    expect(screen.getByText('123456')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'بستن راهنمای کد توسعه' }));
    expect(screen.queryByText('حالت توسعه فعال است — کد ورود:')).not.toBeInTheDocument();
  });

  it('returns to step 1 (phone preserved) via the edit-phone link', async () => {
    const user = userEvent.setup();
    renderLoginForm();
    await goToCodeStep(user);

    await user.click(screen.getByRole('button', { name: 'ویرایش شماره' }));

    const phoneInput = await screen.findByLabelText('شماره موبایل');
    expect(phoneInput).toHaveValue(validPhone);
    expect(screen.queryByLabelText('کد تأیید')).not.toBeInTheDocument();
  });

  it('reports a 429 from the request step with the retry seconds in Persian digits', async () => {
    defaultFetchMock({
      '/api/auth/otp/request': () =>
        jsonResponse(
          {
            statusCode: 429,
            error: 'Too Many Requests',
            message: 'Too many requests',
            code: 'TOO_MANY_REQUESTS',
            retryAfterSeconds: 47,
          },
          429,
        ),
    });
    const user = userEvent.setup();
    renderLoginForm();

    await user.type(screen.getByLabelText('شماره موبایل'), validPhone);
    await user.click(screen.getByRole('button', { name: 'دریافت کد ورود' }));

    expect(await screen.findByText(/۴۷ ثانیه دیگر تلاش کنید/)).toBeInTheDocument();
    expect(screen.queryByLabelText('کد تأیید')).not.toBeInTheDocument();
  });

  it('reports an SMS outage (503) as a toast', async () => {
    defaultFetchMock({
      '/api/auth/otp/request': () =>
        jsonResponse({ statusCode: 503, message: 'SMS provider down' }, 503),
    });
    const user = userEvent.setup();
    renderLoginForm();

    await user.type(screen.getByLabelText('شماره موبایل'), validPhone);
    await user.click(screen.getByRole('button', { name: 'دریافت کد ورود' }));

    expect(
      await screen.findByText('ارسال پیامک با اختلال مواجه است؛ لطفاً کمی بعد تلاش کنید.'),
    ).toBeInTheDocument();
  });

  it('keeps the submit enabled after a network failure (retry affordance)', async () => {
    fetchMock.mockImplementation(async (input) => {
      if (String(input).includes('/api/auth/otp/request')) {
        // First attempt breaks the connection; the retry below succeeds.
        const attempts = fetchMock.mock.calls.filter(([path]) =>
          String(path).includes('/api/auth/otp/request'),
        ).length;
        if (attempts <= 1) {
          throw new TypeError('Failed to fetch');
        }
        return jsonResponse(otpRequestResponse);
      }
      return jsonResponse({ message: 'unauthenticated' }, 401);
    });
    const user = userEvent.setup();
    renderLoginForm();

    await user.type(screen.getByLabelText('شماره موبایل'), validPhone);
    await user.click(screen.getByRole('button', { name: 'دریافت کد ورود' }));

    expect(await screen.findByText(/برقراری ارتباط با سرور ممکن نشد/)).toBeInTheDocument();
    const retryButton = screen.getByRole('button', { name: 'دریافت کد ورود' });
    expect(retryButton).toBeEnabled();

    await user.click(retryButton);
    await screen.findByLabelText('کد تأیید');
  });
});

describe('LoginForm (step 2 — code)', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    mockRouterPush.mockReset();
    defaultFetchMock({
      '/api/auth/otp/verify': () => jsonResponse(otpVerifyResponse),
    });
    global.fetch = fetchMock as unknown as typeof global.fetch;
  });

  it('auto-submits a complete code without tapping the button and routes', async () => {
    const user = userEvent.setup();
    renderLoginForm();
    await goToCodeStep(user);

    await user.type(screen.getByLabelText('کد تأیید'), '123456');

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/auth/otp/verify',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ phone: validPhone, code: '123456', clientType: 'web' }),
        }),
      );
    });
    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/dashboard'));
  });

  it('routes to the sanitized next target when onboarding is complete', async () => {
    const user = userEvent.setup();
    renderLoginForm('/l/abc');
    await goToCodeStep(user);

    await user.type(screen.getByLabelText('کد تأیید'), '123456');

    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/l/abc'));
  });

  it('routes to /onboarding when onboardingCompleted is false', async () => {
    defaultFetchMock({
      '/api/auth/otp/verify': () =>
        jsonResponse({ ...otpVerifyResponse, onboardingCompleted: false }),
    });
    const user = userEvent.setup();
    renderLoginForm();
    await goToCodeStep(user);

    await user.type(screen.getByLabelText('کد تأیید'), '123456');

    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/onboarding'));
  });

  it('shows an inline error and clears the input on a wrong code (401)', async () => {
    defaultFetchMock({
      '/api/auth/otp/verify': () =>
        jsonResponse(
          { statusCode: 401, message: 'Invalid verification code', code: 'UNAUTHORIZED' },
          401,
        ),
    });
    const user = userEvent.setup();
    renderLoginForm();
    await goToCodeStep(user);

    await user.type(screen.getByLabelText('کد تأیید'), '111111');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'کد واردشده صحیح نیست؛ دوباره تلاش کنید',
    );
    expect(screen.getByLabelText('کد تأیید')).toHaveValue('');
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it('shows the wait message when the code is locked after too many attempts', async () => {
    defaultFetchMock({
      '/api/auth/otp/verify': () =>
        jsonResponse(
          {
            statusCode: 401,
            message: 'Too many incorrect attempts',
            code: 'LOCKED',
          },
          401,
        ),
    });
    const user = userEvent.setup();
    renderLoginForm();
    await goToCodeStep(user);

    await user.type(screen.getByLabelText('کد تأیید'), '111111');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'تلاش‌های ناموفق بیش از حد مجاز است؛ لطفاً کد جدید درخواست کنید',
    );
    expect(screen.getByLabelText('کد تأیید')).toHaveValue('');
  });

  it('reports account-status rejections (403) as a toast', async () => {
    defaultFetchMock({
      '/api/auth/otp/verify': () =>
        jsonResponse(
          {
            statusCode: 403,
            message: 'Account suspended',
            code: 'ACCOUNT_SUSPENDED',
          },
          403,
        ),
    });
    const user = userEvent.setup();
    renderLoginForm();
    await goToCodeStep(user);

    await user.type(screen.getByLabelText('کد تأیید'), '123456');

    expect(
      await screen.findByText(
        'حساب شما موقتاً غیرفعال شده است؛ برای پیگیری با پشتیبانی تماس بگیرید.',
      ),
    ).toBeInTheDocument();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });
});

describe('LoginForm resend countdown', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    mockRouterPush.mockReset();
    defaultFetchMock({
      '/api/auth/otp/verify': () => jsonResponse(otpVerifyResponse),
    });
    global.fetch = fetchMock as unknown as typeof global.fetch;
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => jest.runOnlyPendingTimers());
    jest.useRealTimers();
  });

  it('disables resend while counting down, then re-requests the code on click', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderLoginForm();
    await goToCodeStep(user);

    const resend = screen.getByRole('button', { name: 'ارسال مجدد کد تا ۱۲۰ ثانیه دیگر' });
    expect(resend).toBeDisabled();

    act(() => jest.advanceTimersByTime(60_000));
    expect(screen.getByRole('button', { name: 'ارسال مجدد کد تا ۶۰ ثانیه دیگر' })).toBeDisabled();

    act(() => jest.advanceTimersByTime(60_000));
    const enabled = screen.getByRole('button', { name: 'ارسال مجدد کد' });
    expect(enabled).toBeEnabled();

    const requestCalls = fetchMock.mock.calls.filter(([path]) =>
      String(path).includes('/api/auth/otp/request'),
    );
    await user.click(enabled);
    await waitFor(() => {
      const after = fetchMock.mock.calls.filter(([path]) =>
        String(path).includes('/api/auth/otp/request'),
      );
      expect(after.length).toBe(requestCalls.length + 1);
    });
    // A fresh request restarts the countdown.
    expect(screen.getByRole('button', { name: 'ارسال مجدد کد تا ۱۲۰ ثانیه دیگر' })).toBeDisabled();
  });
});
