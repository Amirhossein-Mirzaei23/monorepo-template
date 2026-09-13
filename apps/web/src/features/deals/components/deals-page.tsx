'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { RotateCcw } from 'lucide-react';
import type { DealMyRole, DealStatus } from '@monorepo/shared-types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useDealsList } from '../hooks/use-deals';
import { DEAL_STATUS_LABELS_FA } from '../schemas/deal-schema';
import { DealCard } from './deal-card';

/**
 * DEAL-004 — «معامله‌ها», the /deals page. Role tabs (the card's خرید/فروش)
 * are URL-synced (?tab=…) so views are shareable and back-button safe; the
 * status chip row (?status=) narrows by lifecycle stage; the list loads
 * through useInfiniteQuery with an IntersectionObserver sentinel plus a
 * «بیشتر» fallback (the offers page precedent).
 */

type DealsTab = DealMyRole;

const TABS: ReadonlyArray<{ value: DealsTab; label: string }> = [
  { value: 'buyer', label: 'خرید' },
  { value: 'seller', label: 'فروش' },
];

/** The status chips — the LIFECYCLE order, plus «همه» (the no-filter default). */
const STATUS_CHIPS: ReadonlyArray<{ value: DealStatus; label: string }> = (
  [
    'NEGOTIATING',
    'AGREED',
    'PAYMENT_PENDING',
    'PAID',
    'PREPARING',
    'SHIPPED',
    'DELIVERED',
    'COMPLETED',
    'CANCELLED',
    'DISPUTED',
  ] as const
).map((status) => ({ value: status, label: DEAL_STATUS_LABELS_FA[status] }));

function isDealsTab(value: string | null): value is DealsTab {
  return value === 'buyer' || value === 'seller';
}

const EMPTY_COPY: Record<DealsTab, { title: string; hint: string }> = {
  buyer: {
    title: 'هنوز معامله‌ای نداشته‌اید',
    hint: 'از طریق گفتگو یا پذیرش پیشنهاد، اولین معامله‌ی خود را بسازید.',
  },
  seller: {
    title: 'هنوز معامله‌ای روی لات‌های شما ثبت نشده',
    hint: 'وقتی خریداری به توافق برسد، معامله همین‌جا دیده می‌شود.',
  },
};

function DealCardSkeleton() {
  return (
    <Card className="gap-0 p-3" aria-hidden="true">
      <div className="flex items-start justify-between gap-2">
        <div className="bg-muted h-4 w-2/3 animate-pulse rounded" />
        <div className="bg-muted h-5 w-20 shrink-0 animate-pulse rounded-full" />
      </div>
      <div className="bg-muted mt-2 h-5 w-1/2 animate-pulse rounded" />
      <div className="bg-muted mt-2 h-3 w-1/3 animate-pulse rounded" />
    </Card>
  );
}

interface DealsPanelProps {
  role: DealsTab;
  status?: DealStatus;
  emptyTitle: string;
  emptyHint: string;
}

function DealsPanel({ role, status, emptyTitle, emptyHint }: DealsPanelProps) {
  const list = useDealsList(role, status);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

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

  if (list.isLoading) {
    return (
      <div role="status" aria-label="در حال بارگذاری معامله‌ها" className="grid gap-3">
        <DealCardSkeleton />
        <DealCardSkeleton />
        <DealCardSkeleton />
      </div>
    );
  }

  if (list.isError) {
    return (
      <Card className="grid gap-3 p-6 text-center" data-testid="deals-error">
        <p className="text-sm font-medium">دریافت معامله‌ها ناموفق بود</p>
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
      <Card className="grid gap-2 p-8 text-center" data-testid="deals-empty">
        <p className="text-sm font-medium">{emptyTitle}</p>
        <p className="text-muted-foreground text-xs">{emptyHint}</p>
      </Card>
    );
  }

  return (
    <div className="grid gap-3">
      {list.items.map((deal) => (
        <DealCard key={deal.id} deal={deal} />
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
          همه معامله‌های این دسته نمایش داده شد
        </p>
      )}
    </div>
  );
}

export function DealsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const tabParam = searchParams.get('tab');
  const tab: DealsTab = isDealsTab(tabParam) ? tabParam : 'buyer';

  const statusParam = searchParams.get('status');
  const status =
    statusParam !== null && statusParam in DEAL_STATUS_LABELS_FA
      ? (statusParam as DealStatus)
      : undefined;

  const updateParams = (next: { tab?: DealsTab; status?: DealStatus | undefined }) => {
    const params = new URLSearchParams();
    const nextTab = next.tab ?? tab;
    const nextStatus = next.status !== undefined ? next.status : status;
    params.set('tab', nextTab);
    if (nextStatus !== undefined) {
      params.set('status', nextStatus);
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <section className="mx-auto w-full max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">معامله‌ها</h1>

      <div role="tablist" aria-label="معامله‌ها بر اساس نقش" className="mt-4 flex gap-2">
        {TABS.map((entry) => (
          <button
            key={entry.value}
            type="button"
            role="tab"
            aria-selected={tab === entry.value}
            onClick={() => updateParams({ tab: entry.value })}
            className={
              tab === entry.value
                ? 'bg-primary text-primary-foreground inline-flex min-h-11 shrink-0 items-center rounded-full px-5 text-sm font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent inline-flex min-h-11 shrink-0 items-center rounded-full border px-5 text-sm font-medium'
            }
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="فیلتر وضعیت">
        <button
          type="button"
          aria-pressed={status === undefined}
          onClick={() => updateParams({ status: undefined })}
          className={
            status === undefined
              ? 'bg-primary text-primary-foreground inline-flex min-h-9 items-center rounded-full border px-3.5 text-xs font-medium'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent inline-flex min-h-9 items-center rounded-full border px-3.5 text-xs font-medium'
          }
        >
          همه
        </button>
        {STATUS_CHIPS.map((chip) => (
          <button
            key={chip.value}
            type="button"
            aria-pressed={status === chip.value}
            onClick={() => updateParams({ status: chip.value })}
            className={
              status === chip.value
                ? 'bg-primary text-primary-foreground inline-flex min-h-9 items-center rounded-full border px-3.5 text-xs font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent inline-flex min-h-9 items-center rounded-full border px-3.5 text-xs font-medium'
            }
          >
            {chip.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        aria-label={TABS.find((entry) => entry.value === tab)?.label}
        className="mt-4"
      >
        <DealsPanel
          role={tab}
          status={status}
          emptyTitle={EMPTY_COPY[tab].title}
          emptyHint={EMPTY_COPY[tab].hint}
        />
      </div>
    </section>
  );
}
