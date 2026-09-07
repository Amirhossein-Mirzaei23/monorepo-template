'use client';

import { useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { PackageSearch, RotateCcw } from 'lucide-react';
import type { LotCardResponseDto, Paginated } from '@monorepo/shared-types';
import { Button } from '@/components/ui/button';
import { useCategories } from '@/features/categories';
import { ApiError } from '@/lib/api-client';
import { useLotsList } from '../hooks/use-lots';
import { parseLotsBrowseParams, type LotsBrowseFilter } from '../schemas/browse-query';
import { LotCard, LotCardSkeleton } from './lot-card';

/**
 * MKT-006 — the browse list: a filter-aware, infinitely scrolling LotCard
 * grid driven entirely by URL state. The URL is the single source of the
 * query (validated/dropped per-field by parseLotsBrowseParams), so shareable
 * links and back/forward reproduce the list; a page-scoped `scope` (the
 * /c/{slug} landing) wins over URL params for its keys. Scroll loads the next
 * page through an IntersectionObserver sentinel; a failed append renders an
 * inline retry row and KEEPS the loaded cards (use-lots.ts doc). No filter UI
 * here — MKT-007/008 write the params this list consumes.
 */

/** Grid rhythm: 2-col at 360px, upgraded on larger viewports (ui-patterns.md). */
const GRID_CLASSES = 'grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4';

/** Skeleton tiles while the first page loads (and while the next page appends). */
const FIRST_LOAD_SKELETONS = 6;
const NEXT_PAGE_SKELETONS = 4;

export interface LotListProps {
  /** Page-fixed filters merged over the URL query (category landing scope). */
  scope?: Partial<Pick<LotsBrowseFilter, 'categoryId' | 'subcategoryId'>>;
  /** SSR-fetched first page (RSC handoff); undefined → the hook fetches it. */
  initialPage?: Paginated<LotCardResponseDto>;
  /** Empty-state headline override (default covers q + filters). */
  emptyTitle?: string;
}

/** fa hint for known API error codes; undefined → generic copy only. */
function errorHint(error: Error | null): string | undefined {
  if (error instanceof ApiError && error.body?.code === 'SEARCH_QUERY_TOO_SHORT') {
    return 'جستجو حداقل ۲ کاراکتر باشد.';
  }
  return undefined;
}

export function LotList({ scope, initialPage, emptyTitle = 'نتیجه‌ای یافت نشد' }: LotListProps) {
  const searchParams = useSearchParams();
  const filters = useMemo(
    () => ({ ...parseLotsBrowseParams(searchParams), ...scope }),
    [searchParams, scope],
  );
  const list = useLotsList(filters, initialPage);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // Read at CALL time (not via the effect closure): observers created before an
  // append started must not re-fire fetchNextPage while it is in flight — v5
  // would cancel+restart the running page fetch (duplicate request).
  const appendingRef = useRef(false);

  const { data: categories } = useCategories();
  const suggestions = (categories ?? []).slice(0, 6);

  // Infinite scroll sentinel (frontend-data.md): load the next page when the
  // end of the grid approaches; paused while appending or after a failed
  // append (the retry row takes over until it succeeds).
  useEffect(() => {
    appendingRef.current = list.isFetchingNextPage;
    const node = sentinelRef.current;
    if (!node || !list.hasNextPage || list.isFetchingNextPage || list.isError) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !appendingRef.current) {
          appendingRef.current = true;
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
      <div role="status" aria-label="در حال بارگذاری لات‌ها" className={GRID_CLASSES}>
        {Array.from({ length: FIRST_LOAD_SKELETONS }, (_, index) => (
          <LotCardSkeleton key={index} variant="grid" />
        ))}
      </div>
    );
  }

  if (list.isError && list.items.length === 0) {
    const hint = errorHint(list.error);
    return (
      <div
        role="alert"
        className="border-border bg-card grid place-items-center gap-3 rounded-xl border p-8 text-center"
      >
        <p className="text-sm font-medium">دریافت لات‌ها ناموفق بود</p>
        <p className="text-muted-foreground text-xs">
          {hint ?? 'اتصال خود را بررسی کنید و دوباره تلاش کنید.'}
        </p>
        <Button variant="outline" className="mx-auto" onClick={list.refetch}>
          <RotateCcw className="size-4" aria-hidden="true" />
          تلاش مجدد
        </Button>
      </div>
    );
  }

  if (list.items.length === 0) {
    return (
      <div className="border-border bg-card grid place-items-center gap-3 rounded-xl border p-8 text-center">
        <div
          className="bg-muted text-zinc-400 flex size-14 items-center justify-center rounded-2xl"
          aria-hidden="true"
        >
          <PackageSearch className="size-7" />
        </div>
        <p className="text-sm font-medium">{emptyTitle}</p>
        <p className="text-muted-foreground text-xs">
          {suggestions.length > 0
            ? 'فیلترها را تغییر دهید یا از دسته‌بندی‌های زیر شروع کنید:'
            : 'فیلترها را تغییر دهید و دوباره تلاش کنید.'}
        </p>
        {suggestions.length > 0 ? (
          <div className="flex max-w-md flex-wrap justify-center gap-2">
            {suggestions.map((category) => (
              <Link
                key={category.id}
                href={`/c/${category.slug}`}
                className="text-primary border-border hover:bg-accent inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium"
              >
                {category.nameFa}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <div className={GRID_CLASSES} data-testid="lot-grid">
        {list.items.map((lot) => (
          <LotCard key={lot.id} lot={lot} variant="grid" />
        ))}
        {list.isFetchingNextPage
          ? Array.from({ length: NEXT_PAGE_SKELETONS }, (_, index) => (
              <LotCardSkeleton key={`next-${index}`} variant="grid" />
            ))
          : null}
      </div>

      {list.isError ? (
        // Per-page append failure — the loaded list stays; retry resumes the
        // broken page (or the refetch when the failure hit a refresh instead).
        <div
          role="alert"
          className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 py-6 text-center"
        >
          <p className="text-muted-foreground text-sm">بارگذاری ادامه فهرست ناموفق بود.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={list.hasNextPage ? list.fetchNextPage : list.refetch}
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            تلاش مجدد
          </Button>
        </div>
      ) : (
        <div ref={sentinelRef} aria-hidden="true" />
      )}

      {!list.hasNextPage && !list.isFetchingNextPage ? (
        <p className="text-muted-foreground py-4 text-center text-xs">همه لات‌ها نمایش داده شد</p>
      ) : null}
    </div>
  );
}
