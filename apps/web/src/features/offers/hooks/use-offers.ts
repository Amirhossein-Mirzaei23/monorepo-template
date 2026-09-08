'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import type { OfferMyRole, OfferResponseDto, OfferStatus } from '@monorepo/shared-types';
import { useAuth } from '@/providers/auth-provider';
import { fetchOffers, OFFERS_PAGE_SIZE } from '../api/offers-api';
import { offerKeys } from '../api/keys';

/**
 * One role-aware /offers tab (GET /offers with a fixed role). Infinite query
 * over the Paginated envelope's page/total offset — `getNextPageParam` walks
 * forward while page*limit < total. Disabled until an in-memory access token
 * exists; default staleTime/retry apply (doc/CONVENTIONS.md).
 */
export function useOffers(role: OfferMyRole, status?: OfferStatus) {
  const { accessToken } = useAuth();
  const token = accessToken();
  return useInfiniteQuery({
    queryKey: offerKeys.list(role, status),
    queryFn: ({ pageParam }) =>
      fetchOffers(token, { role, status, page: pageParam, limit: OFFERS_PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page * lastPage.limit < lastPage.total ? lastPage.page + 1 : undefined,
    enabled: Boolean(token),
  });
}

/** Unified list state the page renders (the my-lots panel precedent). */
export interface OffersListState {
  items: OfferResponseDto[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
}

export function useOffersList(role: OfferMyRole, status?: OfferStatus): OffersListState {
  const query = useOffers(role, status);
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
