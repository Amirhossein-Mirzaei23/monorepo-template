'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/providers/auth-provider';
import { fetchLotForOffer } from '../api/offers-api';
import { offerKeys } from '../api/keys';
import type { OfferSheetLot } from '../types';

/**
 * Lot freshness beats the 60 s default: offer quantities validate against the
 * lot's LIVE bounds server-side (409 QUANTITY_OUT_OF_RANGE when stale), so the
 * sheet's context is deliberately fresher — and the sheet's «به‌روزرسانی لات»
 * refresh hint force-refetches this query after a 409 anyway.
 */
const LOT_CONTEXT_STALE_TIME_MS = 30_000;

export interface LotForOfferState {
  /** The sheet's lot context (undefined while loading / no code). */
  lot: OfferSheetLot | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * Resolves the offer sheet's lot context from the public lot code — the ONLY
 * lot reference both the chat thread (conversation summary) and the offer
 * payloads (OfferLotSummaryDto) carry. GET /lots/{code} is the PUBLIC detail
 * endpoint, so no seller/buyer distinction is needed here.
 */
export function useLotForOffer(code: string | undefined, enabled = true): LotForOfferState {
  const { accessToken } = useAuth();
  const token = accessToken();

  const query = useQuery({
    queryKey: code ? offerKeys.lotContext(code) : offerKeys.all,
    queryFn: () => {
      if (!code) {
        throw new Error('Lot code is required for the offer context');
      }
      return fetchLotForOffer(code, token);
    },
    enabled: Boolean(code) && enabled,
    staleTime: LOT_CONTEXT_STALE_TIME_MS,
  });

  return {
    lot: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => {
      void query.refetch();
    },
  };
}
