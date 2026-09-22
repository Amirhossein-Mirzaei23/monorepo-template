'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChevronRight, RotateCcw } from 'lucide-react';
import type { ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatFaDigits, formatRelativeTimeFa } from '@/lib/format';
import {
  useAdminUserDetail,
  useAdminUserRevokeSessionsAction,
  useAdminUserRoleAction,
  useAdminUserStatusAction,
} from '../hooks/use-admin-users';
import {
  ACCOUNT_ROLE_LABELS_FA,
  USER_ROLE_LABELS_FA,
  USER_STATUS_LABELS_FA,
} from '../schemas/users-schema';
import { UserActionDialog } from './user-action-dialog';

/**
 * «جزئیات کاربر» (admin panel Task 05) — the allowlisted detail view (profile
 * summary + bounded lot/deal counts; NEVER password hashes or sessions) with
 * the narrow action set: status transitions, role transition, session
 * revocation. Every destructive action opens a reason dialog; guard failures
 * (self-action / last-admin 409s) render an explicit Persian error block.
 */

type StatusAction = 'SUSPEND' | 'BLOCK' | 'ACTIVATE' | 'DELETE';

const STATUS_ACTION_COPY: Record<
  StatusAction,
  { title: string; description: string; confirm: string; danger?: boolean }
> = {
  SUSPEND: {
    title: 'تعلیق کاربر',
    description: 'حساب کاربر تعلیق می‌شود و همه نشست‌های فعال او باطل می‌شوند.',
    confirm: 'تعلیق',
  },
  BLOCK: {
    title: 'مسدودسازی کاربر',
    description: 'حساب کاربر مسدود می‌شود و همه نشست‌های فعال او باطل می‌شوند.',
    confirm: 'مسدودسازی',
    danger: true,
  },
  ACTIVATE: {
    title: 'فعال‌سازی کاربر',
    description: 'حساب کاربر دوباره فعال می‌شود.',
    confirm: 'فعال‌سازی',
  },
  DELETE: {
    title: 'حذف کاربر',
    description:
      'حساب به‌صورت نرم حذف می‌شود (وضعیت «حذف‌شده») و همه نشست‌های فعال او باطل می‌شود. این اقدام بازگشت‌پذیر نیست.',
    confirm: 'حذف',
    danger: true,
  },
};

const STATUS_DIALOG_ACTIONS: readonly StatusAction[] = ['SUSPEND', 'BLOCK', 'ACTIVATE', 'DELETE'];

/** Persian copy per 409 machine code (ROADMAP_REFERENCE §6). */
const GUARD_ERROR_COPY: Record<string, string> = {
  ADMIN_SELF_ACTION_FORBIDDEN: 'این اقدام روی حساب خودتان مجاز نیست.',
  LAST_ADMIN_GUARD: 'آخرین مدیر فعال سیستم را نمی‌توان تغییر داد.',
  ILLEGAL_USER_STATUS_TRANSITION: 'این تغییر وضعیت در وضعیت فعلی کاربر مجاز نیست.',
};

function actionButtonLabel(action: StatusAction): string {
  return STATUS_ACTION_COPY[action].confirm;
}

function GuardError({ error }: { error: unknown }) {
  const apiError = error as ApiError;
  const code = apiError?.body?.code;
  const message =
    (code !== undefined ? GUARD_ERROR_COPY[code] : undefined) ??
    'انجام این اقدام ناموفق بود. دوباره تلاش کنید.';
  return (
    <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
      {message}
    </p>
  );
}

export function AdminUserDetail({ userId }: { userId: string }) {
  const detail = useAdminUserDetail(userId);
  const statusAction = useAdminUserStatusAction(userId);
  const roleAction = useAdminUserRoleAction(userId);
  const revokeAction = useAdminUserRevokeSessionsAction(userId);

  const [openDialog, setOpenDialog] = useState<
    StatusAction | 'DEMOTE' | 'PROMOTE' | 'REVOKE' | null
  >(null);

  if (detail.isPending) {
    return (
      <div role="status" aria-label="در حال بارگذاری جزئیات کاربر" className="grid gap-3">
        <div className="h-24 animate-pulse rounded-xl bg-zinc-200" />
        <div className="h-40 animate-pulse rounded-xl bg-zinc-200" />
      </div>
    );
  }

  if (detail.isError) {
    return (
      <Card className="grid gap-3 px-6 py-6 text-center" data-testid="admin-user-error">
        <p className="text-sm font-medium">دریافت جزئیات کاربر ناموفق بود</p>
        <p className="text-muted-foreground text-xs">اتصال خود را بررسی کنید و دوباره تلاش کنید.</p>
        <Button variant="outline" className="mx-auto" onClick={() => void detail.refetch()}>
          <RotateCcw className="size-4" aria-hidden="true" />
          تلاش مجدد
        </Button>
      </Card>
    );
  }

  const user = detail.data;
  const anyPending = statusAction.isPending || roleAction.isPending || revokeAction.isPending;
  const guardError = statusAction.error ?? roleAction.error ?? revokeAction.error;
  const deleted = user.status === 'DELETED';

  const confirmStatus = (reason: string) => {
    if (
      openDialog === null ||
      openDialog === 'REVOKE' ||
      openDialog === 'DEMOTE' ||
      openDialog === 'PROMOTE'
    ) {
      return;
    }
    statusAction.mutate({ action: openDialog, reason }, { onSuccess: () => setOpenDialog(null) });
  };

  return (
    <section aria-labelledby="admin-user-detail-title" className="grid gap-4">
      <div>
        <Link
          href="/admin/users"
          className="text-muted-foreground focus-visible:ring-primary inline-flex items-center gap-1 rounded-md text-xs outline-none focus-visible:ring-2"
        >
          <ChevronRight className="size-3.5" aria-hidden="true" />
          بازگشت به فهرست کاربران
        </Link>
        <h2 id="admin-user-detail-title" className="mt-2 text-2xl font-semibold">
          {user.name}
        </h2>
        <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-sm">
          <span dir="ltr">{user.phone}</span>
          {user.email ? (
            <span dir="ltr" className="text-xs">
              {user.email}
            </span>
          ) : null}
          <span
            className={
              deleted
                ? 'rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium'
                : 'rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700'
            }
          >
            {USER_STATUS_LABELS_FA[user.status]}
          </span>
          <span className="text-xs">{USER_ROLE_LABELS_FA[user.role]}</span>
        </p>
      </div>

      {guardError ? <GuardError error={guardError} /> : null}

      <div className="grid gap-3 md:grid-cols-2">
        <Card className="grid gap-2 px-4 py-4 text-sm">
          <h3 className="text-sm font-semibold">پروفایل</h3>
          {user.profile ? (
            <>
              <p>
                <span className="text-muted-foreground text-xs">نام نمایشی: </span>
                {user.profile.displayName}
              </p>
              <p>
                <span className="text-muted-foreground text-xs">نام کسب‌وکار: </span>
                {user.profile.businessName ?? '—'}
              </p>
              <p>
                <span className="text-muted-foreground text-xs">استان/شهر: </span>
                {user.profile.province ?? '—'} / {user.profile.city ?? '—'}
              </p>
              <p>
                <span className="text-muted-foreground text-xs">نقش‌های حساب: </span>
                {user.accountRoles.length > 0
                  ? user.accountRoles.map((role) => ACCOUNT_ROLE_LABELS_FA[role]).join('، ')
                  : '—'}
              </p>
              <p>
                <span className="text-muted-foreground text-xs">معاملات موفق: </span>
                {formatFaDigits(user.profile.successfulDeals)}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground text-xs">
              این کاربر هنوز آنبوردینگ را تکمیل نکرده است.
            </p>
          )}
          <p className="text-muted-foreground text-xs">
            {user.onboardingCompletedAt
              ? `آنبوردینگ: ${formatRelativeTimeFa(user.onboardingCompletedAt)}`
              : 'آنبوردینگ تکمیل نشده'}
          </p>
        </Card>

        <Card className="grid gap-2 px-4 py-4 text-sm">
          <h3 className="text-sm font-semibold">فعالیت بازارگاه</h3>
          <p>
            <span className="text-muted-foreground text-xs">لات‌ها: </span>
            {formatFaDigits(user.counts.lots)}
          </p>
          <p>
            <span className="text-muted-foreground text-xs">معاملات به‌عنوان خریدار: </span>
            {formatFaDigits(user.counts.dealsAsBuyer)}
          </p>
          <p>
            <span className="text-muted-foreground text-xs">معاملات به‌عنوان فروشنده: </span>
            {formatFaDigits(user.counts.dealsAsSeller)}
          </p>
          <p className="text-muted-foreground text-xs">
            عضویت: {formatRelativeTimeFa(user.createdAt)}
          </p>
        </Card>
      </div>

      <Card className="grid gap-3 px-4 py-4">
        <h3 className="text-sm font-semibold">اقدامات مدیریتی</h3>
        <div className="flex flex-wrap gap-2">
          {user.status === 'ACTIVE' ? (
            <Button
              variant="outline"
              disabled={anyPending}
              onClick={() => setOpenDialog('SUSPEND')}
            >
              {actionButtonLabel('SUSPEND')}
            </Button>
          ) : null}
          {user.status === 'ACTIVE' || user.status === 'SUSPENDED' ? (
            <Button variant="outline" disabled={anyPending} onClick={() => setOpenDialog('BLOCK')}>
              {actionButtonLabel('BLOCK')}
            </Button>
          ) : null}
          {user.status === 'SUSPENDED' || user.status === 'BLOCKED' ? (
            <Button disabled={anyPending} onClick={() => setOpenDialog('ACTIVATE')}>
              {actionButtonLabel('ACTIVATE')}
            </Button>
          ) : null}
          {!deleted ? (
            <Button
              variant="destructive"
              disabled={anyPending}
              onClick={() => setOpenDialog('DELETE')}
            >
              {actionButtonLabel('DELETE')}
            </Button>
          ) : null}
          <Button variant="secondary" disabled={anyPending} onClick={() => setOpenDialog('REVOKE')}>
            لغو همه نشست‌ها
          </Button>
          {user.role === 'USER' ? (
            <Button
              variant="outline"
              disabled={anyPending}
              onClick={() => setOpenDialog('PROMOTE')}
            >
              ارتقا به مدیر
            </Button>
          ) : (
            <Button variant="outline" disabled={anyPending} onClick={() => setOpenDialog('DEMOTE')}>
              تنزل به کاربر
            </Button>
          )}
        </div>
        {deleted ? (
          <p className="text-muted-foreground text-xs">
            این حساب حذف (نرم) شده است — تغییر وضعیت دیگری برای آن مجاز نیست.
          </p>
        ) : null}
      </Card>

      {STATUS_DIALOG_ACTIONS.includes(openDialog as StatusAction) ? (
        <UserActionDialog
          open
          title={STATUS_ACTION_COPY[openDialog as StatusAction].title}
          description={STATUS_ACTION_COPY[openDialog as StatusAction].description}
          confirmLabel={STATUS_ACTION_COPY[openDialog as StatusAction].confirm}
          danger={STATUS_ACTION_COPY[openDialog as StatusAction].danger}
          pending={statusAction.isPending}
          onConfirm={confirmStatus}
          onCancel={() => setOpenDialog(null)}
        />
      ) : null}

      {openDialog === 'REVOKE' ? (
        <UserActionDialog
          open
          title="لغو همه نشست‌ها"
          description="همه نشست‌های فعال این کاربر باطل می‌شوند و باید دوباره وارد شوند."
          confirmLabel="لغو نشست‌ها"
          danger
          pending={revokeAction.isPending}
          onConfirm={(reason) =>
            revokeAction.mutate({ reason }, { onSuccess: () => setOpenDialog(null) })
          }
          onCancel={() => setOpenDialog(null)}
        />
      ) : null}

      {openDialog === 'PROMOTE' || openDialog === 'DEMOTE' ? (
        <UserActionDialog
          open
          title={openDialog === 'PROMOTE' ? 'ارتقا به مدیر' : 'تنزل به کاربر'}
          description={
            openDialog === 'PROMOTE'
              ? 'این کاربر به نقش مدیر ارتقا می‌یابد.'
              : 'دسترسی مدیریتی این حساب گرفته می‌شود و نشست‌های فعال او باطل می‌شوند.'
          }
          confirmLabel={openDialog === 'PROMOTE' ? 'ارتقا' : 'تنزل'}
          danger={openDialog === 'DEMOTE'}
          pending={roleAction.isPending}
          onConfirm={(reason) =>
            roleAction.mutate(
              { role: openDialog === 'PROMOTE' ? 'ADMIN' : 'USER', reason },
              { onSuccess: () => setOpenDialog(null) },
            )
          }
          onCancel={() => setOpenDialog(null)}
        />
      ) : null}
    </section>
  );
}
