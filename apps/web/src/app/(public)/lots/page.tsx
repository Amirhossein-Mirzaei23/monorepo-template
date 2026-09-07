import { Suspense } from 'react';
import type { Metadata } from 'next';
import {
  ActiveFilterChips,
  FiltersSheet,
  LotList,
  SearchBar,
  SortSelect,
  fetchLotsServer,
  parseLotsBrowseParams,
  LOT_LIST_PAGE_SIZE,
} from '@/features/marketplace';

/**
 * MKT-006 — the public browse page `/lots`. All list state lives in the URL
 * (q/filters/sort — validated field-by-field by parseLotsBrowseParams, which
 * DROPS malformed values so shareable/hand-typed links never crash), making
 * every view shareable and back-button safe.
 *
 * SSR/client split (doc/CONVENTIONS.md decision table): this server component
 * fetches PAGE 1 ONLY, directly from the API origin (an RSC cannot resolve a
 * relative BFF path and must not self-fetch over HTTP), and hands it to the
 * client list as useInfiniteQuery initialData — page 1 is fetched exactly
 * once, the cards ship in the HTML (SEO/LCP), pages 2+ load through the BFF
 * on scroll. If the SSR hop fails, the same client list degrades to fetching
 * page 1 itself and shows its error state with retry.
 *
 * MKT-007: the SearchBar sits in the listing header — submit lands right back
 * here with a new q. It is keyed by the URL q so back/forward keeps the input
 * in URL sync, and `initialQuery` prefills shared /lots?q=… links (which work
 * logged-out — the page is public). The home page placement is MKT-004.
 *
 * MKT-008: the toolbar above the grid — the filter sheet trigger (bottom
 * sheet on mobile, sidebar panel on ≥md), the sort select and the
 * active-filter chips. All three write the SAME URL params the list reads.
 */
export const metadata: Metadata = {
  title: 'فهرست لات‌ها',
  description: 'خرید و فروش عمده کالای راکد و موجودی مازاد میان کسب‌وکارها',
};

interface LotsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LotsPage({ searchParams }: LotsPageProps) {
  const params = await searchParams;
  const filters = parseLotsBrowseParams(params);
  const initialPage = await fetchLotsServer({
    ...filters,
    page: 1,
    limit: LOT_LIST_PAGE_SIZE,
  }).catch(() => undefined);

  return (
    <main className="mx-auto w-full max-w-(--app-max-width) px-4 pb-10 pt-5 sm:px-6">
      <header className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight">
          {filters.q ? `نتایج جستجو برای «${filters.q}»` : 'لات‌ها'}
        </h1>
        <div className="mt-3">
          <SearchBar key={filters.q ?? ''} initialQuery={filters.q} />
        </div>
      </header>
      <Suspense fallback={<p className="text-muted-foreground text-sm">در حال بارگذاری…</p>}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <FiltersSheet />
          <SortSelect />
        </div>
        <ActiveFilterChips />
        <LotList initialPage={initialPage} />
      </Suspense>
    </main>
  );
}
