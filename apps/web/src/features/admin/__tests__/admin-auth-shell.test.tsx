import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminGuard, AdminLoginForm, AdminShell } from '../index';

const push = jest.fn();
const replace = jest.fn();
jest.mock('next/navigation', () => ({
  usePathname: () => '/admin/users',
  useRouter: () => ({ push, replace }),
}));

jest.mock('../hooks/use-admin-login', () => ({
  useAdminLogin: () => ({ mutateAsync: jest.fn(), isPending: false, isError: false }),
}));

const logout = jest.fn().mockResolvedValue(undefined);
let auth: {
  status: 'authenticated' | 'unauthenticated';
  user: { role: 'ADMIN' | 'USER' } | undefined;
  logout: typeof logout;
} = {
  status: 'authenticated',
  user: { role: 'ADMIN' },
  logout,
};
jest.mock('../../../providers/auth-provider', () => ({
  useAuth: () => auth,
}));

describe('admin authentication and shell', () => {
  beforeEach(() => {
    push.mockReset();
    replace.mockReset();
    logout.mockClear();
    auth = {
      status: 'authenticated',
      user: { role: 'ADMIN' },
      logout,
    };
  });

  it('renders the password form with safe input semantics and generic invalid-credential errors', async () => {
    render(<AdminLoginForm />);
    expect(screen.getByLabelText('ایمیل')).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByLabelText('رمز عبور')).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByLabelText('ایمیل')).toHaveAttribute('dir', 'ltr');
    expect(screen.getByLabelText('رمز عبور')).toHaveAttribute('dir', 'ltr');
  });

  it('allows keyboard users to navigate the exact admin destinations and logout', async () => {
    render(
      <AdminShell>
        <p>محتوا</p>
      </AdminShell>,
    );
    expect(screen.getByRole('link', { name: 'نمای کلی' })).toHaveAttribute('href', '/admin');
    expect(screen.getByRole('link', { name: 'کاربران' })).toHaveAttribute('href', '/admin/users');
    expect(screen.getByRole('link', { name: 'لات‌ها' })).toHaveAttribute('href', '/admin/lots');
    expect(screen.getByRole('link', { name: 'گزارش‌ها' })).toHaveAttribute(
      'href',
      '/admin/reports',
    );
    expect(screen.getByRole('link', { name: 'تأییدها' })).toHaveAttribute(
      'href',
      '/admin/verifications',
    );
    expect(screen.getByRole('link', { name: 'معاملات' })).toHaveAttribute('href', '/admin/deals');
    expect(screen.getByRole('link', { name: 'دسته‌بندی‌ها' })).toHaveAttribute(
      'href',
      '/admin/categories',
    );
    expect(screen.getByRole('link', { name: 'حسابرسی' })).toHaveAttribute('href', '/admin/audit');
    expect(screen.getByRole('link', { name: 'کاربران' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'نمای کلی' })).not.toHaveAttribute('aria-current');
    await userEvent.click(screen.getByRole('button', { name: 'خروج' }));
    expect(logout).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/admin/login'));
  });

  it('still navigates to the admin login when the logout call rejects', async () => {
    logout.mockRejectedValueOnce(new Error('BFF unreachable'));
    render(
      <AdminShell>
        <p>محتوا</p>
      </AdminShell>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'خروج' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/admin/login'));
  });

  it('does not render protected admin content for an authenticated USER', () => {
    auth = { status: 'authenticated', user: { role: 'USER' }, logout };
    render(
      <AdminGuard>
        <p>داده محرمانه</p>
      </AdminGuard>,
    );
    expect(screen.queryByText('داده محرمانه')).not.toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith('/');
  });

  it('renders protected admin content for an ADMIN', () => {
    render(
      <AdminGuard>
        <p>داده محرمانه</p>
      </AdminGuard>,
    );
    expect(screen.getByText('داده محرمانه')).toBeInTheDocument();
  });

  it('hides protected admin content once logout leaves the session unauthenticated', () => {
    const view = render(
      <AdminGuard>
        <p>داده محرمانه</p>
      </AdminGuard>,
    );
    expect(screen.getByText('داده محرمانه')).toBeInTheDocument();

    auth = { status: 'unauthenticated', user: undefined, logout };
    view.rerender(
      <AdminGuard>
        <p>داده محرمانه</p>
      </AdminGuard>,
    );
    expect(screen.queryByText('داده محرمانه')).not.toBeInTheDocument();
  });
});
