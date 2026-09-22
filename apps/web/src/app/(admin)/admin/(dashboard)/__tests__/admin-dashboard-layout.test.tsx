import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AdminLoginForm } from '../../../../../features/admin';
import AdminDashboardLayout from '../layout';

/**
 * Composed Task 03 guard test: the guarded layout must hide admin UI from an
 * anonymous visitor, while /admin/login stays a direct child of admin/ — so
 * the login form renders outside the guard (no blank-screen redirect loop).
 * Relative specifiers only: jest cannot resolve the `@/` alias (or mocked
 * modules through it) from inside the parenthesized route-group directories.
 */

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  usePathname: () => '/admin/login',
  useRouter: () => ({ push: jest.fn(), replace }),
}));

const logout = jest.fn().mockResolvedValue(undefined);
let auth: {
  status: 'authenticated' | 'unauthenticated';
  user: { role: 'ADMIN' | 'USER' } | undefined;
  logout: typeof logout;
} = { status: 'unauthenticated', user: undefined, logout };

jest.mock('../../../../../providers/auth-provider', () => ({
  useAuth: () => auth,
}));

function Wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('admin (dashboard) layout composition', () => {
  it('renders nothing for an anonymous visitor instead of leaking admin UI', () => {
    const { container } = render(
      <AdminDashboardLayout>
        <p>داده محرمانه</p>
      </AdminDashboardLayout>,
    );
    expect(screen.queryByText('داده محرمانه')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('keeps the login form reachable outside the guarded shell', () => {
    render(
      <Wrapper>
        <AdminLoginForm next="/admin" />
      </Wrapper>,
    );
    expect(screen.getByLabelText('ایمیل')).toBeInTheDocument();
    expect(screen.getByLabelText('رمز عبور')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ورود' })).toBeInTheDocument();
  });

  it('renders the guarded shell for an ADMIN', () => {
    auth = { status: 'authenticated', user: { role: 'ADMIN' }, logout };
    render(
      <AdminDashboardLayout>
        <p>داده محرمانه</p>
      </AdminDashboardLayout>,
    );
    expect(screen.getByRole('navigation', { name: 'ناوبری مدیریت' })).toBeInTheDocument();
    expect(screen.getByText('داده محرمانه')).toBeInTheDocument();
  });
});
