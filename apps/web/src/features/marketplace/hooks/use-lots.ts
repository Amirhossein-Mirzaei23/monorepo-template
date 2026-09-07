'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import type { LotCardResponseDto, Paginated } from '@monorepo/shared-types';
import { fetchLots } from '../api/marketplace-api';
import { marketplaceKeys } from '../api/keys';
import { LOT_LIST_PAGE_SIZE, type LotsBrowseFilter } from '../schemas/browse-query';

/**
 * MKT-006 — the public listing behind the browse grid (GET /lots through the
 * BFF), one infinite query per URL filter variant (frontend-data.md:
 * URL-synced view state → each shareable variant caches independently).
 *
 * `initialPage` is the SSR handoff: the RSC route fetches page 1 server-side
 * (SEO/LCP, decision table in doc/CONVENTIONS.md) and passes it here as
 * initialData, so page 1 is never fetched twice and the HTML ships the cards.
 * When the SSR hop failed (undefined) the query simply starts client-side —
 * its failure then surfaces as the list's error state.
 *
 * Default staleTime/retry apply (doc/CONVENTIONS.md); per-page appends that
 * fail keep the fetched pages and flip the query into error, which LotList
 * renders as an inline retry row (fetchNextPage recomputes the same next page
 * from the last GOOD page, so retry resumes exactly where it broke).
 */
export function useLots(filters: LotsBrowseFilter, initialPage?: Paginated<LotCardResponseDto>) {
  return useInfiniteQuery({
    queryKey: marketplaceKeys.list(filters),
    queryFn: ({ pageParam }) =>
      fetchLots({ ...filters, page: pageParam, limit: LOT_LIST_PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page * lastPage.limit < lastPage.total ? lastPage.page + 1 : undefined,
    initialData: initialPage ? { pages: [initialPage], pageParams: [1] } : undefined,
  });
}

/** Flattened list state the LotList renders (pages → items + the scroll controls). */
export interface LotsListState {
  items: LotCardResponseDto[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
}

export function useLotsList(
  filters: LotsBrowseFilter,
  initialPage?: Paginated<LotCardResponseDto>,
): LotsListState {
  const query = useLots(filters, initialPage);
  return {
    items: query.data?.pages.flatMap((page) => page.items) ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: () => {
      void query.refetch();
    },
    hasNextPage: Boolean(query.hasNextPage),
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: () => {
      void query.fetchNextPage();
    },
  };
}
