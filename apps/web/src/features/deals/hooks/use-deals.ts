'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { DealMyRole, DealResponseDto, DealStatus } from '@monorepo/shared-types';
import { useAuth } from '@/providers/auth-provider';
import { fetchDealDetail, fetchDeals, DEALS_PAGE_SIZE } from '../api/deals-api';
import { dealKeys } from '../api/keys';
import { TERMINAL_DEAL_STATUSES } from '../schemas/deal-schema';

/**
 * One role-aware /deals tab (GET /deals with a fixed role). Infinite query
 * over the Paginated envelope's page/total offset — the useOffers shape.
 * Disabled until an in-memory access token exists; default staleTime/retry
 * apply (doc/CONVENTIONS.md).
 */
export function useDeals(role: DealMyRole, status?: DealStatus) {
  const { accessToken } = useAuth();
  const token = accessToken();
  return useInfiniteQuery({
    queryKey: dealKeys.list(role, status),
    queryFn: ({ pageParam }) =>
      fetchDeals(token, { role, status, page: pageParam, limit: DEALS_PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page * lastPage.limit < lastPage.total ? lastPage.page + 1 : undefined,
    enabled: Boolean(token),
  });
}

/** Unified list state the page renders (the offers panel precedent). */
export interface DealsListState {
  items: DealResponseDto[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
}

export function useDealsList(role: DealMyRole, status?: DealStatus): DealsListState {
  const query = useDeals(role, status);
  return {
    items: query.data?.pages.flatMap((page) => page.items) ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
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
 * GET /deals/:code — the detail payload. Live updates (the card's
 * "notifications/refresh"; NTF is P1): 30 s polling ONLY while any
 * participant move is still possible — terminal deals
 * (TERMINAL_DEAL_STATUSES) stop polling.
 */
export function useDealDetail(code: string) {
  const { accessToken } = useAuth();
  const token = accessToken();
  return useQuery({
    queryKey: dealKeys.detail(code),
    queryFn: () => fetchDealDetail(token, code),
    enabled: Boolean(token),
    refetchInterval: (query) =>
      TERMINAL_DEAL_STATUSES.includes(query.state.data?.status as DealStatus) ? false : 30_000,
  });
}
