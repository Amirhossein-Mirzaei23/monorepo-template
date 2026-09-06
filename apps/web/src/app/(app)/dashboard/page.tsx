'use client';

import Link from 'next/link';
import { useMe } from '@/features/auth';
import { useAuth } from '@/providers/auth-provider';
import { ChevronLeft, Layers } from 'lucide-react';

/**
 * Dashboard home — interactive client view backed by the auth feature's
 * react-query hook (client fetching; see doc/CONVENTIONS.md decision table).
 * The «آگهی‌های من» card (LOT-005) links into the seller inventory; the rest
 * of the dashboard stays the PLAT-002 placeholder until DSH-002 redesigns it.
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

      <Link
        href="/dashboard/lots"
        className="hover:border-ring mt-6 flex items-center gap-3 rounded-xl border p-4 transition-colors"
      >
        <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
          <Layers className="size-5" aria-hidden="true" />
        </span>
        <span className="flex-1">
          <span className="block text-sm font-semibold">آگهی‌های من</span>
          <span className="text-muted-foreground block text-xs">
            مدیریت آگهی‌ها، توقف/فعال‌سازی و ثبت فروش
          </span>
        </span>
        <ChevronLeft className="text-muted-foreground size-5" aria-hidden="true" />
      </Link>
    </section>
  );
}
