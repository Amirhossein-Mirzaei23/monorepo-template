'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import type { LotOwnerResponseDto } from '@monorepo/shared-types';
import { useAuth } from '@/providers/auth-provider';
import { myLotsRequest, type MineStatusFilter } from '../api/lots-api';
import { lotKeys } from '../api/keys';

/** Inventory page size — mobile scroll pace (frontend-data.md: sentinel-first). */
export const MY_LOTS_PAGE_SIZE = 10;

/**
 * One inventory tab (GET /lots/mine with a fixed status). Infinite query over
 * the Paginated envelope's page/total offset: `getNextPageParam` walks forward
 * while page*limit < total. Disabled until an in-memory access token exists;
 * default staleTime/retry apply (doc/CONVENTIONS.md).
 */
export function useMyLots(status: MineStatusFilter) {
  const { accessToken } = useAuth();
  const token = accessToken();
  return useInfiniteQuery({
    queryKey: lotKeys.mine(status),
    queryFn: ({ pageParam }) =>
      myLotsRequest(token, {
        status,
        page: pageParam,
        limit: MY_LOTS_PAGE_SIZE,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page * lastPage.limit < lastPage.total ? lastPage.page + 1 : undefined,
    enabled: Boolean(token),
  });
}

/** Unified list state the page renders — single-tab or the merged فعال tab. */
export interface MyLotsListState {
  items: LotOwnerResponseDto[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
}

/**
 * One single-status tab wrapped in the unified list state (the counterpart of
 * useMyLotsLive) — the panel components stay hook-shape-agnostic.
 */
export function useMyLotsTab(status: MineStatusFilter): MyLotsListState {
  const query = useMyLots(status);
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

/**
 * The «فعال» tab — ACTIVE + PAUSED merged. The card's tab list has no paused
 * tab of its own, yet «همه اقدامات LOT-003 از UI قابل اجرا باشد» requires
 * resume to be reachable, so temporarily-paused listings live next to the
 * active ones (they ARE the seller's live listings, just hidden from buyers).
 * Merged newest-first; the sentinel advances whichever half still has pages.
 */
export function useMyLotsLive(): MyLotsListState {
  const active = useMyLots('ACTIVE');
  const paused = useMyLots('PAUSED');

  return {
    items: [
      ...(active.data?.pages.flatMap((page) => page.items) ?? []),
      ...(paused.data?.pages.flatMap((page) => page.items) ?? []),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    isLoading: active.isLoading || paused.isLoading,
    isError: active.isError || paused.isError,
    error: (active.error ?? paused.error) as Error | null,
    refetch: () => {
      void active.refetch();
      void paused.refetch();
    },
    hasNextPage: Boolean(active.hasNextPage || paused.hasNextPage),
    isFetchingNextPage: active.isFetchingNextPage || paused.isFetchingNextPage,
    fetchNextPage: () => {
      if (active.hasNextPage) {
        void active.fetchNextPage();
      }
      if (paused.hasNextPage) {
        void paused.fetchNextPage();
      }
    },
  };
}
