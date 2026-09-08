'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { RotateCcw } from 'lucide-react';
import type { OfferMyRole, OfferResponseDto } from '@monorepo/shared-types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useOffersList } from '../hooks/use-offers';
import { OfferCard } from './offer-card';
import { OfferSheet } from './offer-sheet';

/**
 * OFR-004 — «پیشنهادها», the /offers page. Role-aware tabs (the card's
 * دریافتی/ارسالی) are URL-synced (?tab=…) so views are shareable and
 * back-button safe; the list loads through useInfiniteQuery with an
 * IntersectionObserver sentinel plus a «بیشتر» button fallback (the my-lots
 * precedent). Both tabs render for every account — the API's role=seller list
 * is not seller-hat-gated, so a buyer's دریافتی is simply an empty state.
 *
 * The counter sheet is hosted here: the seller card's «پیشنهاد متقابل» opens
 * the SAME make-offer sheet pre-filled with the countered offer's terms
 * (counter reuses the sheet — the card's requirement).
 */

type OffersTab = OfferMyRole;

const TABS: ReadonlyArray<{ value: OffersTab; label: string }> = [
  { value: 'seller', label: 'دریافتی' },
  { value: 'buyer', label: 'ارسالی' },
];

function isOffersTab(value: string | null): value is OffersTab {
  return value === 'seller' || value === 'buyer';
}

const EMPTY_COPY: Record<OffersTab, { title: string; hint: string }> = {
  seller: {
    title: 'هنوز پیشنهادی دریافت نکرده‌اید',
    hint: 'وقتی خریداری روی یکی از لات‌های شما پیشنهاد بگذارد، همین‌جا می‌بینید.',
  },
  buyer: {
    title: 'هنوز پیشنهادی نفرستاده‌اید',
    hint: 'از داخل گفتگوی هر لات، «پیشنهاد قیمت» را بزنید.',
  },
};

function OfferCardSkeleton() {
  return (
    <Card className="gap-0 p-3" aria-hidden="true">
      <div className="flex items-start justify-between gap-2">
        <div className="bg-muted h-4 w-2/3 animate-pulse rounded" />
        <div className="bg-muted h-5 w-20 shrink-0 animate-pulse rounded-full" />
      </div>
      <div className="bg-muted mt-2 h-5 w-1/2 animate-pulse rounded" />
      <div className="bg-muted mt-2 h-3 w-1/3 animate-pulse rounded" />
      <div className="mt-3 flex gap-2">
        <div className="bg-muted h-8 flex-1 animate-pulse rounded-md" />
        <div className="bg-muted h-8 flex-1 animate-pulse rounded-md" />
      </div>
    </Card>
  );
}

interface OffersPanelProps {
  role: OffersTab;
  emptyTitle: string;
  emptyHint: string;
}

function OffersPanel({ role, emptyTitle, emptyHint }: OffersPanelProps) {
  const list = useOffersList(role);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [counterOffer, setCounterOffer] = useState<OfferResponseDto | null>(null);

  // Infinite scroll sentinel; the «بیشتر» button is the keyboard/manual fallback.
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
      <div role="status" aria-label="در حال بارگذاری پیشنهادها" className="grid gap-3">
        <OfferCardSkeleton />
        <OfferCardSkeleton />
        <OfferCardSkeleton />
      </div>
    );
  }

  if (list.isError) {
    return (
      <Card className="grid gap-3 p-6 text-center" data-testid="offers-error">
        <p className="text-sm font-medium">دریافت پیشنهادها ناموفق بود</p>
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
      <Card className="grid gap-2 p-8 text-center" data-testid="offers-empty">
        <p className="text-sm font-medium">{emptyTitle}</p>
        <p className="text-muted-foreground text-xs">{emptyHint}</p>
        {role === 'buyer' ? (
          <Button asChild variant="outline" className="mx-auto mt-2">
            <Link href="/lots">مشاهده لات‌ها</Link>
          </Button>
        ) : null}
      </Card>
    );
  }

  return (
    <div className="grid gap-3">
      {list.items.map((offer) => (
        <OfferCard key={offer.id} offer={offer} onCounter={setCounterOffer} />
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
          همه پیشنهادهای این دسته نمایش داده شد
        </p>
      )}

      <OfferSheet
        open={counterOffer !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCounterOffer(null);
          }
        }}
        lotCode={counterOffer?.lot.code}
        counterOffer={counterOffer ?? undefined}
      />
    </div>
  );
}

export function OffersPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const param = searchParams.get('tab');
  const tab: OffersTab = isOffersTab(param) ? param : 'seller';

  const selectTab = (value: OffersTab) => {
    router.replace(`${pathname}?tab=${value}`, { scroll: false });
  };

  return (
    <section className="mx-auto w-full max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">پیشنهادها</h1>

      <div role="tablist" aria-label="پیشنهادها بر اساس نقش" className="mt-4 flex gap-2">
        {TABS.map((entry) => (
          <button
            key={entry.value}
            type="button"
            role="tab"
            aria-selected={tab === entry.value}
            onClick={() => selectTab(entry.value)}
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

      <div
        role="tabpanel"
        aria-label={TABS.find((entry) => entry.value === tab)?.label}
        className="mt-4"
      >
        <OffersPanel
          role={tab}
          emptyTitle={EMPTY_COPY[tab].title}
          emptyHint={EMPTY_COPY[tab].hint}
        />
      </div>
    </section>
  );
}
