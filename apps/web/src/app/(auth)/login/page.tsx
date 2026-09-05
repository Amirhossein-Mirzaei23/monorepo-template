import type { Metadata } from 'next';
import { LoginForm } from '@/features/auth';

export const metadata: Metadata = { title: 'ورود' };

/** Same-origin `next` targets only — blocks protocol-relative/open redirects. */
function safeNextTarget(next: string | undefined): string | undefined {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) {
    return undefined;
  }
  return next;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">ورود به راکدشو</h1>
      <p className="text-muted-foreground text-sm">
        شماره موبایل خود را وارد کنید تا کد ورود برایتان پیامک شود.
      </p>
      <LoginForm redirectTo={safeNextTarget(next) ?? '/dashboard'} />
    </>
  );
}
