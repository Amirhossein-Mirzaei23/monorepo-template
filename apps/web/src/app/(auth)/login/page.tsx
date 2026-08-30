import type { Metadata } from 'next';
import { LoginForm } from '@/features/auth';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <>
      <h1 className="auth-title">Sign in</h1>
      <p className="auth-hint">
        Seeded accounts: <code>admin@monorepo.local</code> / <code>admin-password-123</code>
      </p>
      <LoginForm />
    </>
  );
}
