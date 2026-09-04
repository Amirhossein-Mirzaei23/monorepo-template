'use client';

import { useMe } from '@/features/auth';
import { useAuth } from '@/providers/auth-provider';

/**
 * Dashboard home — interactive client view backed by the auth feature's
 * react-query hook (client fetching; see doc/CONVENTIONS.md decision table).
 */
export default function DashboardPage() {
  const { status, user } = useAuth();
  const me = useMe();

  if (status === 'loading') {
    return <p className="text-muted-foreground">در حال بازیابی نشست…</p>;
  }
  if (status === 'unauthenticated') {
    return <p className="text-muted-foreground">نشست منقضی شده است — دوباره وارد شوید.</p>;
  }

  const profile = me.data ?? user;
  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">داشبورد</h1>
      {profile ? (
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          <dt className="text-muted-foreground">نام</dt>
          <dd>{profile.name}</dd>
          <dt className="text-muted-foreground">ایمیل</dt>
          <dd>{profile.email}</dd>
          <dt className="text-muted-foreground">نقش</dt>
          <dd>{profile.role}</dd>
        </dl>
      ) : (
        <p className="text-muted-foreground">در حال بارگذاری مشخصات…</p>
      )}
    </section>
  );
}
