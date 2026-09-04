import type { Metadata } from 'next';
import { LoginForm } from '@/features/auth';

export const metadata: Metadata = { title: 'ورود' };

export default function LoginPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">ورود به راکدشو</h1>
      <p className="text-muted-foreground text-sm">
        حساب‌های نمونه: <code>admin@monorepo.local</code> / <code>admin-password-123</code>
      </p>
      <LoginForm />
    </>
  );
}
