import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/providers/auth-provider';
import { AdminGuard, AdminLoginForm } from '../index';

/**
 * Task 03 flow tests against a mocked BFF (`global.fetch`): generic
 * invalid-credential errors, silent refresh restoration, and the restored
 * USER denial — the same matrix the middleware cannot decide (role lives
 * behind the httpOnly cookie, so the client guard + API 403 decide it).
 */

const push = jest.fn();
const replace = jest.fn();
jest.mock('next/navigation', () => ({
  usePathname: () => '/admin',
  useRouter: () => ({ push, replace }),
}));

function session(role: 'ADMIN' | 'USER') {
  return {
    accessToken: 'header.payload.signature',
    user: {
      id: 'admin-1',
      phone: '09120000000',
      email: 'admin@rakdsho.local',
      name: 'مدیر سامانه',
      role,
      status: 'ACTIVE',
      accountRoles: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const fetchMock = jest.fn();

/** Default BFF mock: silent session-restore fails (anonymous visitor). */
function mockBff(handlers: Record<string, () => Response> = {}) {
  fetchMock.mockImplementation(async (input) => {
    const path = String(input);
    const match = Object.keys(handlers).find((route) => path.includes(route));
    return match ? handlers[match]!() : jsonResponse({ message: 'unauthenticated' }, 401);
  });
}

function Wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
  mockBff();
  global.fetch = fetchMock as unknown as typeof global.fetch;
});

describe('AdminLoginForm credentials', () => {
  it('reports invalid credentials with a generic message and does not navigate', async () => {
    mockBff({ '/api/auth/login': () => jsonResponse({ message: 'Invalid credentials' }, 401) });
    render(
      <Wrapper>
        <AdminLoginForm next="/admin/users" />
      </Wrapper>,
    );

    await userEvent.type(screen.getByLabelText('ایمیل'), 'admin@rakdsho.local');
    await userEvent.type(screen.getByLabelText('رمز عبور'), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: 'ورود' }));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'admin@rakdsho.local', password: 'wrong-password' }),
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('ایمیل یا رمز عبور نادرست است.');
    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('signs an admin in, routes to the sanitized next path, and fills the guard', async () => {
    mockBff({ '/api/auth/login': () => jsonResponse(session('ADMIN')) });
    render(
      <Wrapper>
        <AdminLoginForm next="/admin/users" />
        <AdminGuard>
          <p>داده محرمانه</p>
        </AdminGuard>
      </Wrapper>,
    );

    await userEvent.type(screen.getByLabelText('ایمیل'), 'admin@rakdsho.local');
    await userEvent.type(screen.getByLabelText('رمز عبور'), 's3cret-password');
    await userEvent.click(screen.getByRole('button', { name: 'ورود' }));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'admin@rakdsho.local', password: 's3cret-password' }),
      }),
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/admin/users'));
    // login(payload) landed the ADMIN session in the in-memory provider state,
    // so a guard mounted beside the form now renders the protected content.
    expect(await screen.findByText('داده محرمانه')).toBeInTheDocument();
  });
});

describe('AdminGuard session restoration', () => {
  it('waits while the silent refresh runs, then renders for a restored ADMIN', async () => {
    mockBff({ '/api/auth/refresh': () => jsonResponse(session('ADMIN')) });
    render(
      <Wrapper>
        <AdminGuard>
          <p>داده محرمانه</p>
        </AdminGuard>
      </Wrapper>,
    );

    // While restoration is pending the guarded content stays hidden.
    expect(screen.queryByText('داده محرمانه')).not.toBeInTheDocument();
    expect(await screen.findByText('داده محرمانه')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/refresh',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it('denies a restored USER session and sends them home', async () => {
    mockBff({ '/api/auth/refresh': () => jsonResponse(session('USER')) });
    render(
      <Wrapper>
        <AdminGuard>
          <p>داده محرمانه</p>
        </AdminGuard>
      </Wrapper>,
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
    expect(screen.queryByText('داده محرمانه')).not.toBeInTheDocument();
  });
});
