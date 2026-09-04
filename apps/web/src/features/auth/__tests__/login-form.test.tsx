import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

import { ToastProvider } from '@/components/ui/toast';
import { AuthProvider } from '@/providers/auth-provider';
import { LoginForm } from '../components/login-form';

const validLoginResponse = {
  accessToken: 'header.payload.signature',
  user: {
    id: 'user-1',
    email: 'jane@example.com',
    name: 'Jane Doe',
    role: 'USER',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function renderLoginForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <LoginForm />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('LoginForm', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    // Default: the silent session-restore call fails (no cookie in tests).
    fetchMock.mockImplementation(async () => jsonResponse({ message: 'unauthenticated' }, 401));
    global.fetch = fetchMock as unknown as typeof global.fetch;
  });

  it('renders labelled, keyboard-accessible fields (Persian copy)', () => {
    renderLoginForm();
    expect(screen.getByLabelText('ایمیل')).toBeInTheDocument();
    expect(screen.getByLabelText('گذرواژه')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ورود' })).toHaveAttribute('type', 'submit');
  });

  it('shows inline schema errors for an invalid email', async () => {
    renderLoginForm();
    await userEvent.type(screen.getByLabelText('ایمیل'), 'not-an-email');
    await userEvent.type(screen.getByLabelText('گذرواژه'), 'secret');
    await userEvent.click(screen.getByRole('button', { name: 'ورود' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('ایمیل معتبر وارد کنید');
    expect(fetchMock).not.toHaveBeenCalledWith('/api/auth/login', expect.anything());
  });

  it('submits to the BFF and toasts success', async () => {
    fetchMock.mockImplementation(async (input) =>
      String(input).includes('/api/auth/login')
        ? jsonResponse(validLoginResponse, 200)
        : jsonResponse({ message: 'unauthenticated' }, 401),
    );
    renderLoginForm();

    await userEvent.type(screen.getByLabelText('ایمیل'), 'jane@example.com');
    await userEvent.type(screen.getByLabelText('گذرواژه'), 'super-secret-1');
    await userEvent.click(screen.getByRole('button', { name: 'ورود' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/auth/login',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    expect(await screen.findByText('خوش آمدید!')).toBeInTheDocument();
  });

  it('reports API failures as error toasts (not inline)', async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse(
        { statusCode: 401, error: 'Unauthorized', message: 'Invalid email or password' },
        401,
      ),
    );
    renderLoginForm();

    await userEvent.type(screen.getByLabelText('ایمیل'), 'jane@example.com');
    await userEvent.type(screen.getByLabelText('گذرواژه'), 'wrong-pass');
    await userEvent.click(screen.getByRole('button', { name: 'ورود' }));

    expect(await screen.findByText('Invalid email or password')).toBeInTheDocument();
  });
});
