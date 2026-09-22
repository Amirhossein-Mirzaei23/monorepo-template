'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { RotateCcw, Search } from 'lucide-react';
import { useState } from 'react';
import type { AdminUserListItem } from '../schemas/users-schema';
import {
  ACCOUNT_ROLE_LABELS_FA,
  USER_ROLE_LABELS_FA,
  USER_STATUS_LABELS_FA,
} from '../schemas/users-schema';
import { useAdminUsers } from '../hooks/use-admin-users';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatFaDigits, formatRelativeTimeFa } from '@/lib/format';

/**
 * «کاربران» (admin panel Task 05) — the URL-driven, linkable users table.
 * Every filter lives in the search params (?q=&status=&role=&accountRole=
 * &onboarded=&page=) so the overview's status deep-links and browser
 * navigation work exactly as linked. Narrow screens fall back to card rows;
 * pagination is deterministic (API-side createdAt desc + id tiebreak).
 */

/** The status chips — lifecycle order plus «همه». */
const STATUS_FILTERS = ['ACTIVE', 'SUSPENDED', 'BLOCKED', 'DELETED'] as const;
const ROLE_FILTERS = ['USER', 'ADMIN'] as const;

const PAGE_SIZE = 20;

function parseFilters(searchParams: URLSearchParams) {
  const statusParam = searchParams.get('status');
  const roleParam = searchParams.get('role');
  const accountRoleParam = searchParams.get('accountRole');
  const onboardedParam = searchParams.get('onboarded');
  const pageParam = Number(searchParams.get('page'));
  return {
    q: searchParams.get('q') ?? undefined,
    status:
      statusParam !== null && statusParam in USER_STATUS_LABELS_FA
        ? (statusParam as keyof typeof USER_STATUS_LABELS_FA)
        : undefined,
    role:
      roleParam !== null && roleParam in USER_ROLE_LABELS_FA
        ? (roleParam as keyof typeof USER_ROLE_LABELS_FA)
        : undefined,
    accountRole:
      accountRoleParam !== null && accountRoleParam in ACCOUNT_ROLE_LABELS_FA
        ? (accountRoleParam as keyof typeof ACCOUNT_ROLE_LABELS_FA)
        : undefined,
    onboarded: onboardedParam === 'true' ? true : onboardedParam === 'false' ? false : undefined,
    page: Number.isInteger(pageParam) && pageParam > 0 ? pageParam : undefined,
  };
}

function chipClass(active: boolean): string {
  return active
    ? 'bg-primary text-primary-foreground inline-flex min-h-9 items-center rounded-full border px-3.5 text-xs font-medium'
    : 'text-muted-foreground hover:text-foreground hover:bg-accent inline-flex min-h-9 items-center rounded-full border px-3.5 text-xs font-medium';
}

function UserRow({ user }: { user: AdminUserListItem }) {
  return (
    <li className="rounded-lg border bg-white md:rounded-none md:border-0 md:border-b">
      <Link
        href={`/admin/users/${user.id}`}
        className="focus-visible:ring-primary flex flex-col gap-2 rounded-lg px-3 py-3 outline-none focus-visible:ring-2 md:flex-row md:items-center md:justify-between md:gap-4"
      >
        <span className="grid min-w-0 gap-0.5">
          <span className="flex items-center gap-2 text-sm font-medium">
            {user.name}
            <span dir="ltr" className="text-muted-foreground text-xs">
              {user.phone}
            </span>
          </span>
          <span className="text-muted-foreground truncate text-xs">
            {user.profile?.businessName ?? user.profile?.displayName ?? '—'}
            {user.email ? <span dir="ltr"> · {user.email}</span> : null}
          </span>
        </span>
        <span className="flex shrink-0 flex-wrap items-center gap-2 text-xs">
          <span
            className={
              user.status === 'ACTIVE'
                ? 'rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700'
                : 'rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700'
            }
          >
            {USER_STATUS_LABELS_FA[user.status]}
          </span>
          <span className="text-muted-foreground">{USER_ROLE_LABELS_FA[user.role]}</span>
          <span className="text-muted-foreground">{formatRelativeTimeFa(user.createdAt)}</span>
        </span>
      </Link>
    </li>
  );
}

export function AdminUsers() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [searchDraft, setSearchDraft] = useState(searchParams.get('q') ?? '');

  const filters = parseFilters(searchParams);
  const list = useAdminUsers(filters);

  const updateParams = (patch: Partial<ReturnType<typeof parseFilters>>) => {
    const next = { ...filters, ...patch };
    const params = new URLSearchParams();
    if (next.q) {
      params.set('q', next.q);
    }
    if (next.status) {
      params.set('status', next.status);
    }
    if (next.role) {
      params.set('role', next.role);
    }
    if (next.accountRole) {
      params.set('accountRole', next.accountRole);
    }
    if (next.onboarded !== undefined) {
      params.set('onboarded', String(next.onboarded));
    }
    if (next.page !== undefined && next.page > 1) {
      params.set('page', String(next.page));
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const total = list.data?.total ?? 0;
  const page = filters.page ?? 1;
  // The server's `limit` is authoritative — the page count can never drift
  // from what the API actually returns per page.
  const pageCount = Math.max(1, Math.ceil(total / (list.data?.limit ?? PAGE_SIZE)));

  return (
    <section aria-labelledby="admin-users-title" className="grid gap-4">
      <header>
        <h2 id="admin-users-title" className="text-2xl font-semibold">
          کاربران
        </h2>
        <p className="text-muted-foreground mt-2 text-sm">
          جست‌وجو بر اساس شماره موبایل، نام، ایمیل یا نام کسب‌وکار — با فیلتر وضعیت و نقش.
        </p>
      </header>

      <form
        role="search"
        aria-label="فرم جست‌وجوی کاربران"
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          updateParams({ q: searchDraft.trim() || undefined, page: undefined });
        }}
      >
        <Input
          type="search"
          value={searchDraft}
          onChange={(event) => setSearchDraft(event.target.value)}
          placeholder="۰۹۱۲…، نام، ایمیل یا کسب‌وکار"
          aria-label="جست‌وجوی کاربران"
          className="max-w-md"
        />
        <Button type="submit" variant="outline">
          <Search className="size-4" aria-hidden="true" />
          جست‌وجو
        </Button>
      </form>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="فیلتر وضعیت">
        <button
          type="button"
          aria-pressed={filters.status === undefined}
          onClick={() => updateParams({ status: undefined, page: undefined })}
          className={chipClass(filters.status === undefined)}
        >
          همه
        </button>
        {STATUS_FILTERS.map((status) => (
          <button
            key={status}
            type="button"
            aria-pressed={filters.status === status}
            onClick={() => updateParams({ status, page: undefined })}
            className={chipClass(filters.status === status)}
          >
            {USER_STATUS_LABELS_FA[status]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="فیلتر نقش">
        {ROLE_FILTERS.map((role) => (
          <button
            key={role}
            type="button"
            aria-pressed={filters.role === role}
            onClick={() =>
              updateParams({ role: filters.role === role ? undefined : role, page: undefined })
            }
            className={chipClass(filters.role === role)}
          >
            {USER_ROLE_LABELS_FA[role]}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={filters.onboarded === true}
          onClick={() =>
            updateParams({
              onboarded: filters.onboarded === true ? undefined : true,
              page: undefined,
            })
          }
          className={chipClass(filters.onboarded === true)}
        >
          تأییدشده آنبوردینگ
        </button>
        <button
          type="button"
          aria-pressed={filters.onboarded === false}
          onClick={() =>
            updateParams({
              onboarded: filters.onboarded === false ? undefined : false,
              page: undefined,
            })
          }
          className={chipClass(filters.onboarded === false)}
        >
          بدون آنبوردینگ
        </button>
      </div>

      {list.isLoading ? (
        <div role="status" aria-label="در حال بارگذاری کاربران" className="grid gap-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-14 animate-pulse rounded-lg bg-zinc-200" />
          ))}
        </div>
      ) : list.isError ? (
        <Card className="grid gap-3 px-6 py-6 text-center" data-testid="admin-users-error">
          <p className="text-sm font-medium">دریافت فهرست کاربران ناموفق بود</p>
          <p className="text-muted-foreground text-xs">
            اتصال خود را بررسی کنید و دوباره تلاش کنید.
          </p>
          <Button variant="outline" className="mx-auto" onClick={() => void list.refetch()}>
            <RotateCcw className="size-4" aria-hidden="true" />
            تلاش مجدد
          </Button>
        </Card>
      ) : list.data === undefined ? null : list.data.items.length === 0 ? (
        <Card className="grid gap-2 px-8 py-8 text-center" data-testid="admin-users-empty">
          <p className="text-sm font-medium">کاربری با این مشخصات پیدا نشد</p>
          <p className="text-muted-foreground text-xs">
            فیلترها را تغییر دهید یا عبارت دیگری جست‌وجو کنید.
          </p>
        </Card>
      ) : (
        <>
          <p className="text-muted-foreground text-xs" aria-live="polite">
            {formatFaDigits(total)} کاربر — صفحه {formatFaDigits(page)} از{' '}
            {formatFaDigits(pageCount)}
          </p>
          <ul className="grid gap-2 md:grid-cols-1" data-testid="admin-users-rows">
            {list.data.items.map((user) => (
              <UserRow key={user.id} user={user} />
            ))}
          </ul>
          <nav aria-label="صفحه‌بندی کاربران" className="flex items-center justify-center gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => updateParams({ page: page - 1 })}
            >
              صفحه قبل
            </Button>
            <span className="text-muted-foreground text-xs tabular-nums">
              {formatFaDigits(page)} / {formatFaDigits(pageCount)}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pageCount}
              onClick={() => updateParams({ page: page + 1 })}
            >
              صفحه بعد
            </Button>
          </nav>
        </>
      )}
    </section>
  );
}
