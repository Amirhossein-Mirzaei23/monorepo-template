import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { ApiError } from '@/lib/api-client';
import { AuthProvider, useAuth } from '@/providers/auth-provider';
import { useOtpRequest } from '../hooks/use-otp-request';
import { useOtpVerify } from '../hooks/use-otp-verify';

/**
 * Hook tests against a mocked BFF (`global.fetch`): assert the exact BFF
 * payloads, error normalization into ApiError, and that a successful verify
 * lands the session in AuthProvider (frontend-data.md → Tests).
 */

const otpRequestResponse = {
  expiresAt: '2026-01-01T00:02:00.000Z',
  devCode: '123456',
};

const otpVerifyResponse = {
  accessToken: 'header.payload.signature',
  user: {
    id: 'user-1',
    phone: '09123456789',
    email: null,
    name: 'Jane Doe',
    role: 'USER',
    status: 'ACTIVE',
    accountRoles: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  onboardingCompleted: false,
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

/** Routes a mocked fetch: OTP endpoints get `otp` responses, everything else 401. */
function mockBff(handlers: Record<string, (input: RequestInfo | URL) => Response>) {
  fetchMock.mockImplementation(async (input) => {
    const path = String(input);
    const match = Object.keys(handlers).find((route) => path.includes(route));
    return match ? handlers[match]!(input) : jsonResponse({ message: 'unauthenticated' }, 401);
  });
}

const fetchMock = jest.fn();

function createWrapper(withAuth: boolean) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return withAuth ? (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    ) : (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  // Default: the silent session-restore call fails (no cookie in tests).
  fetchMock.mockImplementation(async () => jsonResponse({ message: 'unauthenticated' }, 401));
  global.fetch = fetchMock as unknown as typeof global.fetch;
});

describe('useOtpRequest', () => {
  it('posts the phone with clientType web to the BFF and returns the response', async () => {
    mockBff({ '/api/auth/otp/request': () => jsonResponse(otpRequestResponse) });
    const { result } = renderHook(() => useOtpRequest(), {
      wrapper: createWrapper(false),
    });

    await act(async () => {
      result.current.mutate('09123456789');
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/otp/request',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ phone: '09123456789', clientType: 'web' }),
      }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(otpRequestResponse);
  });

  it('surfaces a 429 as an ApiError carrying retryAfterSeconds', async () => {
    mockBff({
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
    const { result } = renderHook(() => useOtpRequest(), {
      wrapper: createWrapper(false),
    });

    await act(async () => {
      result.current.mutate('09123456789');
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    const error = result.current.error;
    expect(error).toBeInstanceOf(ApiError);
    if (error instanceof ApiError) {
      expect(error.status).toBe(429);
      expect(error.body?.retryAfterSeconds).toBe(47);
    }
  });
});

describe('useOtpVerify', () => {
  /** Probe: renders both the verify hook and the auth state it must update. */
  function VerifyHarness() {
    const verify = useOtpVerify();
    const auth = useAuth();
    return (
      <div>
        <button
          type="button"
          onClick={() => void verify.mutateAsync({ phone: '09123456789', code: '123456' })}
        >
          verify
        </button>
        <span data-testid="onboarding">
          {verify.data ? String(verify.data.onboardingCompleted) : ''}
        </span>
        <span data-testid="auth-status">{auth.status}</span>
        <span data-testid="auth-phone">{auth.user?.phone ?? ''}</span>
      </div>
    );
  }

  it('posts phone+code to the BFF, keeps onboardingCompleted, lands the session', async () => {
    mockBff({ '/api/auth/otp/verify': () => jsonResponse(otpVerifyResponse) });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <VerifyHarness />
        </AuthProvider>
      </QueryClientProvider>,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'verify' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/auth/otp/verify',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ phone: '09123456789', code: '123456', clientType: 'web' }),
        }),
      );
    });
    expect(await screen.findByTestId('onboarding')).toHaveTextContent('false');
    expect(await screen.findByTestId('auth-status')).toHaveTextContent('authenticated');
    expect(screen.getByTestId('auth-phone')).toHaveTextContent('09123456789');
  });
});
