'use client';

import Link from 'next/link';
import { ChevronLeft, FileWarning, ShieldCheck, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import type { AdminOverviewCountersDto } from '@monorepo/shared-types';
import { LOT_STATUS_LABELS_FA } from '@/features/lots';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatFaDigits, formatRelativeTimeFa } from '@/lib/format';
import { useAdminOverview } from '../hooks/use-admin-overview';
import { ADMIN_OVERVIEW_HREFS } from '../constants';

/**
 * «نمای کلی مدیریت» (admin panel Task 04) — the bounded workload dashboard.
 * Every number is a real count from GET /admin/overview; the two surfaces
 * whose domains do not exist yet (reports → Task 09, verifications → Task 10)
 * render their genuine zero as an explicit «به‌زودی» note, never a fake
 * metric. Count cards and queue CTAs carry their filter intent into the
 * target admin page (?status=…).
 */

/** One count card: Persian label, Persian digits, and the queue deep-link. */
function CountCard({
  label,
  value,
  href,
  accent = false,
  footnote,
}: {
  label: string;
  value: number;
  href: string;
  accent?: boolean;
  footnote?: string;
}) {
  return (
    <Link
      href={href}
      className="focus-visible:ring-primary block rounded-xl outline-none focus-visible:ring-2"
    >
      <Card
        className={
          accent && value > 0
            ? 'gap-2 border-amber-300 bg-amber-50 px-4 py-4 transition-colors hover:bg-amber-100'
            : 'gap-2 px-4 py-4 transition-colors hover:bg-zinc-100'
        }
      >
        <span className="text-2xl font-bold tabular-nums">{formatFaDigits(value)}</span>
        <span className="text-sm font-medium">{label}</span>
        {footnote ? <span className="text-muted-foreground text-xs">{footnote}</span> : null}
      </Card>
    </Link>
  );
}

function QueueCard({
  title,
  actionHref,
  actionLabel,
  children,
}: {
  title: string;
  actionHref: string;
  actionLabel: string;
  children: ReactNode;
}) {
  return (
    <Card className="gap-3 px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Link
          href={actionHref}
          className="focus-visible:ring-primary flex items-center gap-1 rounded-md text-xs font-medium text-primary outline-none focus-visible:ring-2"
        >
          {actionLabel}
          <ChevronLeft className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
      {children}
    </Card>
  );
}

export function AdminOverview() {
  const overview = useAdminOverview();

  if (overview.isPending) {
    return (
      <div role="status" aria-label="در حال بارگذاری نمای کلی" className="grid gap-3">
        <div className="h-24 animate-pulse rounded-xl bg-zinc-200" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="h-20 animate-pulse rounded-xl bg-zinc-200" />
          ))}
        </div>
      </div>
    );
  }

  if (overview.isError) {
    return (
      <Card className="grid gap-3 px-6 py-6 text-center">
        <p className="text-sm font-medium">دریافت نمای کلی ناموفق بود</p>
        <p className="text-muted-foreground text-xs">اتصال خود را بررسی کنید و دوباره تلاش کنید.</p>
        <Button variant="outline" className="mx-auto" onClick={() => void overview.refetch()}>
          <RotateCcw className="size-4" aria-hidden="true" />
          تلاش مجدد
        </Button>
      </Card>
    );
  }

  const counts: AdminOverviewCountersDto = overview.data.counts;

  return (
    <section aria-labelledby="admin-overview-title" className="grid gap-6">
      <header>
        <h2 id="admin-overview-title" className="text-2xl font-semibold">
          نمای کلی مدیریت
        </h2>
        <p className="text-muted-foreground mt-2">
          کارهای نیازمند اقدام در یک نگاه — برای رفتن به صف مربوطه یک کارت را انتخاب کنید.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <CountCard
          label="لات‌های در انتظار بررسی"
          value={counts.pendingReviewLots}
          href={ADMIN_OVERVIEW_HREFS.pendingLots}
          accent
        />
        <CountCard
          label="گزارش‌های باز"
          value={counts.openReports}
          href={ADMIN_OVERVIEW_HREFS.openReports}
          footnote="پس از فعال‌سازی بخش گزارش‌ها"
        />
        <CountCard
          label="تأییدهای در انتظار"
          value={counts.pendingVerifications}
          href={ADMIN_OVERVIEW_HREFS.pendingVerifications}
          footnote="پس از فعال‌سازی بخش تأییدها"
        />
        <CountCard
          label="معاملات درگیر اختلاف"
          value={counts.disputedDeals}
          href={ADMIN_OVERVIEW_HREFS.disputedDeals}
          accent
        />
        <CountCard
          label="کاربران فعال"
          value={counts.activeUsers}
          href={ADMIN_OVERVIEW_HREFS.activeUsers}
        />
        <CountCard
          label="کاربران تعلیق‌شده"
          value={counts.suspendedUsers}
          href={ADMIN_OVERVIEW_HREFS.suspendedUsers}
        />
        <CountCard
          label="کاربران مسدود"
          value={counts.blockedUsers}
          href={ADMIN_OVERVIEW_HREFS.blockedUsers}
        />
        <CountCard
          label="کاربران جدید (۷ روز اخیر)"
          value={counts.newUsersLast7Days}
          href={ADMIN_OVERVIEW_HREFS.newUsers}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <QueueCard
          title="قدیمی‌ترین لات‌های در انتظار بررسی"
          actionHref={ADMIN_OVERVIEW_HREFS.pendingLots}
          actionLabel="مشاهده همه"
        >
          {overview.data.oldestPendingLots.length === 0 ? (
            <p className="text-muted-foreground flex items-center gap-2 text-xs">
              <ShieldCheck className="size-4" aria-hidden="true" />
              صف بررسی خالی است — هیچ لاتی در انتظار بررسی نیست.
            </p>
          ) : (
            <ul className="grid gap-2">
              {overview.data.oldestPendingLots.map((lot) => (
                <li
                  key={lot.id}
                  className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate font-medium">{lot.title}</span>
                  <span className="text-muted-foreground flex shrink-0 items-center gap-2 text-xs">
                    <span dir="ltr">{lot.code}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {LOT_STATUS_LABELS_FA[lot.status]} · {formatRelativeTimeFa(lot.createdAt)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </QueueCard>

        <QueueCard
          title="قدیمی‌ترین گزارش‌های باز"
          actionHref={ADMIN_OVERVIEW_HREFS.openReports}
          actionLabel="مشاهده همه"
        >
          {overview.data.oldestOpenReports.length === 0 ? (
            <p className="text-muted-foreground flex items-center gap-2 text-xs">
              <FileWarning className="size-4" aria-hidden="true" />
              فعلاً گزارشی برای بررسی نیست.
            </p>
          ) : (
            <ul className="grid gap-2">
              {overview.data.oldestOpenReports.map((report) => (
                <li
                  key={report.id}
                  className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                >
                  <span className="font-medium">گزارش</span>
                  <span className="text-muted-foreground text-xs">
                    {formatRelativeTimeFa(report.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </QueueCard>
      </div>
    </section>
  );
}
