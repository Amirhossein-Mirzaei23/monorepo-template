'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Plus, RotateCcw } from 'lucide-react';
import type { LotOwnerResponseDto, LotStatus } from '@monorepo/shared-types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { LotLifecycleAction } from '../api/lots-api';
import { useDeleteLot, useLotAction } from '../hooks/use-lot-actions';
import { useMyLotsLive, useMyLotsTab, type MyLotsListState } from '../hooks/use-my-lots';
import { LOT_STATUS_LABELS_FA } from '../schemas/lot-schema';
import { ConfirmDialog } from './confirm-dialog';
import { MyLotRow } from './my-lot-row';

/**
 * LOT-005 — «آگهی‌های من», the seller inventory. Tabs are URL-synced
 * (?tab=…) so views are shareable and back-button safe (frontend-data.md);
 * the فعال tab merges ACTIVE + PAUSED (see useMyLotsLive — resume must stay
 * reachable). Lists load through useInfiniteQuery with an
 * IntersectionObserver sentinel plus a «بیشتر» button fallback; every
 * lifecycle action opens a Persian confirm dialog before the LOT-003
 * endpoint fires, and the list self-corrects via lotKeys.all invalidation
 * (no optimistic cache surgery).
 */

/** Tab values: the merged live tab + the five single-status LotStatus tabs. */
type TabValue = 'live' | LotStatus;

const TABS: ReadonlyArray<{ value: TabValue; label: string }> = [
  { value: 'live', label: LOT_STATUS_LABELS_FA.ACTIVE },
  { value: 'PENDING_REVIEW', label: LOT_STATUS_LABELS_FA.PENDING_REVIEW },
  { value: 'DRAFT', label: LOT_STATUS_LABELS_FA.DRAFT },
  { value: 'REJECTED', label: LOT_STATUS_LABELS_FA.REJECTED },
  { value: 'SOLD', label: LOT_STATUS_LABELS_FA.SOLD },
  { value: 'EXPIRED', label: LOT_STATUS_LABELS_FA.EXPIRED },
];

function isTabValue(value: string | null): value is TabValue {
  return value !== null && TABS.some((tab) => tab.value === value);
}

/** Persian confirm copy per quick action (danger only for delete). */
type PendingConfirmation =
  | { lot: LotOwnerResponseDto; kind: 'action'; action: LotLifecycleAction }
  | { lot: LotOwnerResponseDto; kind: 'delete' };

const CONFIRM_COPY: Record<
  LotLifecycleAction | 'delete',
  { title: string; description: string; confirmLabel: string; danger?: boolean }
> = {
  pause: {
    title: 'توقف موقت آگهی',
    description: 'آگهی تا فعال‌سازی مجدد از نمایش عمومی پنهان می‌شود. ادامه می‌دهید؟',
    confirmLabel: 'توقف موقت',
  },
  resume: {
    title: 'فعال‌سازی مجدد آگهی',
    description: 'آگهی دوباره برای خریداران نمایش داده می‌شود.',
    confirmLabel: 'فعال‌سازی',
  },
  'mark-sold': {
    title: 'ثبت فروش آگهی',
    description: 'موجودی صفر و آگهی به بخش «فروخته‌شده» می‌رود. این کار قابل بازگشت نیست.',
    confirmLabel: 'ثبت فروش',
  },
  duplicate: {
    title: 'تکثیر آگهی',
    description: 'یک کپی به‌صورت پیش‌نویس جدید ساخته می‌شود؛ آگهی اصلی دست‌نخورده می‌ماند.',
    confirmLabel: 'ساخت کپی',
  },
  delete: {
    title: 'حذف آگهی',
    description:
      'آگهی از همه فهرست‌ها حذف می‌شود و دیگر نمایش داده نمی‌شود. این کار قابل بازگشت نیست.',
    confirmLabel: 'حذف آگهی',
    danger: true,
  },
};

function RowSkeleton() {
  return (
    <Card className="p-3" aria-hidden="true">
      <div className="flex gap-3">
        <div className="bg-muted size-20 shrink-0 animate-pulse rounded-xl" />
        <div className="flex-1 space-y-2">
          <div className="bg-muted h-4 w-3/4 animate-pulse rounded" />
          <div className="bg-muted h-4 w-1/3 animate-pulse rounded" />
          <div className="bg-muted h-3 w-1/2 animate-pulse rounded" />
        </div>
      </div>
    </Card>
  );
}

interface PanelProps {
  list: MyLotsListState;
  emptyMessage: string;
}

function MyLotsPanel({ list, emptyMessage }: PanelProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const act = useLotAction();
  const del = useDeleteLot();

  // Infinite scroll sentinel (frontend-data.md); the «بیشتر» button below is
  // the keyboard/manual fallback when the observer is unavailable.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !list.hasNextPage) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !list.isFetchingNextPage) {
          list.fetchNextPage();
        }
      },
      { rootMargin: '240px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [list]);

  const closeDialog = () => {
    if (!act.isPending && !del.isPending) {
      setPending(null);
    }
  };

  const confirmPending = () => {
    if (!pending) {
      return;
    }
    if (pending.kind === 'delete') {
      del.mutate({ id: pending.lot.id }, { onSettled: () => setPending(null) });
      return;
    }
    act.mutate(
      { id: pending.lot.id, action: pending.action },
      { onSettled: () => setPending(null) },
    );
  };

  if (list.isLoading) {
    return (
      <div role="status" aria-label="در حال بارگذاری آگهی‌ها" className="grid gap-3">
        <RowSkeleton />
        <RowSkeleton />
        <RowSkeleton />
      </div>
    );
  }

  if (list.isError) {
    return (
      <Card className="grid gap-3 p-6 text-center">
        <p className="text-sm font-medium">دریافت آگهی‌ها ناموفق بود</p>
        <p className="text-muted-foreground text-xs">اتصال خود را بررسی کنید و دوباره تلاش کنید.</p>
        <Button variant="outline" className="mx-auto" onClick={list.refetch}>
          <RotateCcw className="size-4" aria-hidden="true" />
          تلاش مجدد
        </Button>
      </Card>
    );
  }

  if (list.items.length === 0) {
    return (
      <Card className="grid gap-3 p-8 text-center">
        <p className="text-sm font-medium">{emptyMessage}</p>
        <p className="text-muted-foreground text-xs">
          اولین لات خود را بسازید و در چند دقیقه به فروش برسانید.
        </p>
        <Button asChild className="mx-auto">
          <Link href="/dashboard/lots/new">
            <Plus className="size-4" aria-hidden="true" />
            آگهی جدید
          </Link>
        </Button>
      </Card>
    );
  }

  const copy = pending ? CONFIRM_COPY[pending.kind === 'delete' ? 'delete' : pending.action] : null;

  return (
    <div className="grid gap-3">
      {list.items.map((lot) => (
        <MyLotRow
          key={lot.id}
          lot={lot}
          onAction={(row, action) => setPending({ lot: row, kind: 'action', action })}
          onDelete={(row) => setPending({ lot: row, kind: 'delete' })}
        />
      ))}

      <div ref={sentinelRef} aria-hidden="true" />

      {list.hasNextPage ? (
        <Button
          variant="outline"
          className="mx-auto"
          disabled={list.isFetchingNextPage}
          onClick={list.fetchNextPage}
        >
          {list.isFetchingNextPage ? 'در حال بارگذاری…' : 'بیشتر'}
        </Button>
      ) : (
        <p className="text-muted-foreground py-2 text-center text-xs">
          همه آگهی‌های این دسته نمایش داده شد
        </p>
      )}

      {pending && copy ? (
        <ConfirmDialog
          open
          title={copy.title}
          description={copy.description}
          confirmLabel={copy.confirmLabel}
          danger={copy.danger}
          pending={act.isPending || del.isPending}
          onConfirm={confirmPending}
          onCancel={closeDialog}
        />
      ) : null}
    </div>
  );
}

/** One hook-set per panel shape — remounting on tab switch resets scroll state. */
function LivePanel() {
  const list = useMyLotsLive();
  return <MyLotsPanel list={list} emptyMessage="هنوز آگهی فعالی ندارید" />;
}

function SingleStatusPanel({ status }: { status: Exclude<TabValue, 'live'> }) {
  const list = useMyLotsTab(status);
  return (
    <MyLotsPanel
      list={list}
      emptyMessage={`هنوز آگهی‌ای در دسته «${LOT_STATUS_LABELS_FA[status]}» ندارید`}
    />
  );
}

export function MyLotsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const param = searchParams.get('tab');
  const tab: TabValue = isTabValue(param) ? param : 'live';

  const selectTab = (value: TabValue) => {
    router.replace(`${pathname}?tab=${value}`, { scroll: false });
  };

  return (
    <section>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">آگهی‌های من</h1>
        <Link
          href="/dashboard/lots/new"
          className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
        >
          <Plus className="size-4" aria-hidden="true" />
          آگهی جدید
        </Link>
      </div>

      <div
        role="tablist"
        aria-label="دسته‌بندی آگهی‌ها بر اساس وضعیت"
        className="-mx-6 mt-4 flex gap-2 overflow-x-auto px-6 pb-1"
      >
        {TABS.map((entry) => (
          <button
            key={entry.value}
            type="button"
            role="tab"
            aria-selected={tab === entry.value}
            onClick={() => selectTab(entry.value)}
            className={
              tab === entry.value
                ? 'bg-primary text-primary-foreground inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium'
            }
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        aria-label={TABS.find((entry) => entry.value === tab)?.label}
        className="mt-4"
      >
        {tab === 'live' ? <LivePanel /> : <SingleStatusPanel status={tab} />}
      </div>

      {/* FAB — bottom-start, thumb-reachable (ui-patterns.md seller surfaces). */}
      <Link
        href="/dashboard/lots/new"
        className="bg-primary text-primary-foreground fixed bottom-6 start-6 z-40 inline-flex h-12 items-center gap-2 rounded-full px-5 text-sm font-medium shadow-lg"
      >
        <Plus className="size-5" aria-hidden="true" />
        آگهی جدید
      </Link>
    </section>
  );
}
