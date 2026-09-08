'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CounterOfferDto, CreateOfferDto, OfferResponseDto } from '@monorepo/shared-types';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';
import { createOfferRequest, offerActionRequest, type OfferAction } from '../api/offers-api';
import { offerKeys } from '../api/keys';

/** Persian copy per machine error code (OFR-002 — OFFER_ERROR_CODES + the shared role codes). */
const ACTION_ERROR_MESSAGES_FA: Record<string, string> = {
  OFFER_EXPIRED: 'مهلت این پیشنهاد گذشته است',
  ILLEGAL_TRANSITION: 'این عمل در وضعیت فعلی پیشنهاد امکان‌پذیر نیست',
  LOT_NOT_ACTIVE: 'لات این پیشنهاد دیگر فعال نیست',
  STALE_QUANTITY: 'موجودی لات تغییر کرده است — فهرست را به‌روزرسانی کنید',
  SELLER_REQUIRED: 'برای این کار ابتدا باید فروشنده شوید',
  BUYER_REQUIRED: 'برای این کار ابتدا باید خریدار باشید',
  OFFER_NOT_SELLER: 'این پیشنهاد به لات شما تعلق ندارد',
  OFFER_NOT_BUYER: 'این پیشنهاد متعلق به شما نیست',
};

function offerErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const code = error.body?.code;
    if (code !== undefined) {
      const message = ACTION_ERROR_MESSAGES_FA[code];
      if (message !== undefined) {
        return message;
      }
    }
  }
  return 'عملیات ناموفق بود — دوباره تلاش کنید';
}

/** Success toast copy per card action (counter goes through the sheet). */
const ACTION_SUCCESS_MESSAGES_FA: Record<'accept' | 'reject' | 'cancel', string> = {
  accept: 'پیشنهاد پذیرفته شد',
  reject: 'پیشنهاد رد شد',
  cancel: 'پیشنهاد لغو شد',
};

/** The card-level actions (accept/reject by the seller, cancel by the buyer). */
export type CardOfferAction = Exclude<OfferAction, 'counter'>;

/**
 * One decision mutation for the offer cards. Every action changes the offers
 * lists (and may auto-reject siblings on accept), so success AND failure both
 * invalidate the whole `offerKeys.all` scope — the refetch is the truth (the
 * use-lot-actions precedent; no optimistic cache surgery).
 */
export function useOfferAction() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({
      offer,
      action,
    }: {
      offer: OfferResponseDto;
      action: CardOfferAction;
    }): Promise<OfferResponseDto> => offerActionRequest(accessToken(), offer.id, action),
    onSuccess: (_offer, { action }) => {
      void queryClient.invalidateQueries({ queryKey: offerKeys.all });
      toast(ACTION_SUCCESS_MESSAGES_FA[action], 'success');
    },
    onError: (error: unknown) => {
      toast(offerErrorMessage(error), 'error');
      void queryClient.invalidateQueries({ queryKey: offerKeys.all });
    },
  });
}

export interface SubmitOfferInput {
  quantity: number;
  unitPrice: number;
  note?: string;
}

/** The sheet's two submit shapes — create (buyer) or counter (seller). */
export type SubmitOfferPayload =
  | { mode: 'create'; lotId: string; conversationId?: string; values: SubmitOfferInput }
  | { mode: 'counter'; offerId: string; values: SubmitOfferInput };

/**
 * The offer sheet's submit mutation (create + counter). Deliberately TOAST-
 * FREE: the card demands 409s (LOT_NOT_ACTIVE / QUANTITY_OUT_OF_RANGE /
 * OFFER_EXPIRED) surface as INLINE fa banners inside the sheet with a «به‌روزرسانی
 * لات» refresh hint — the component owns the error rendering, the hook owns
 * the invalidation.
 */
export function useSubmitOffer() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ payload }: { payload: SubmitOfferPayload }): Promise<OfferResponseDto> => {
      const { values } = payload;
      const note = values.note;
      if (payload.mode === 'create') {
        const body: CreateOfferDto = {
          lotId: payload.lotId,
          quantity: values.quantity,
          unitPrice: values.unitPrice,
          ...(note !== undefined ? { note } : {}),
          ...(payload.conversationId !== undefined
            ? { conversationId: payload.conversationId }
            : {}),
        };
        return createOfferRequest(accessToken(), body);
      }
      const body: CounterOfferDto = {
        quantity: values.quantity,
        unitPrice: values.unitPrice,
        ...(note !== undefined ? { note } : {}),
      };
      return offerActionRequest(accessToken(), payload.offerId, 'counter', body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: offerKeys.all });
    },
  });
}

export { offerErrorMessage };
