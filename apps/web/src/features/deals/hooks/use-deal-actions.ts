'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DealResponseDto, TransitionDealDto } from '@monorepo/shared-types';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';
import { dealActionRequest, type DealAction } from '../api/deals-api';
import { dealKeys } from '../api/keys';

/** Persian copy per machine error code (DEAL-002/003 — DEAL_ERROR_CODES). */
const ACTION_ERROR_MESSAGES_FA: Record<string, string> = {
  DEAL_NOT_FOUND: 'این معامله پیدا نشد',
  DEAL_NOT_PARTICIPANT: 'این معامله متعلق به شما نیست',
  TRANSITION_ROLE_FORBIDDEN: 'این اقدام در نقش شما امکان‌پذیر نیست',
  ILLEGAL_TRANSITION: 'این عمل در وضعیت فعلی معامله امکان‌پذیر نیست',
  DEAL_STALE_STATE: 'وضعیت معامله تغییر کرده — در حال به‌روزرسانی',
  REASON_REQUIRED: 'نوشتن دلیل برای این اقدام الزامی است',
  DISPUTE_REASON_TOO_SHORT: 'دلیل اختلاف حداقل ۲۰ نویسه است',
  NOTE_TOO_LONG: 'متن واردشده بیش از حد مجاز است',
  PAYMENT_CONFIRM_BUYER_ONLY: 'فقط خریدار می‌تواند پرداخت را اعلام کند',
  PAYMENT_NOT_PENDING: 'معامله در مرحله پرداخت نیست',
  PAYMENT_ALREADY_CONFIRMED: 'پرداخت قبلاً اعلام شده است',
};

export function dealErrorMessage(error: unknown): string {
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

/** Success toast copy per action. */
const ACTION_SUCCESS_MESSAGES_FA: Record<DealAction, string> = {
  transition: 'وضعیت معامله به‌روزرسانی شد',
  cancel: 'معامله لغو شد',
  'payment-confirm': 'پرداخت شما اعلام شد',
};

export interface DealActionInput {
  code: string;
  action: DealAction;
  /** transition body (the target + optional note) — cancel uses `reason`. */
  body?: TransitionDealDto | { reason: string };
}

/**
 * One mutation for the deal detail's action bar. Every action changes the
 * deal (and its timeline), so success AND failure both invalidate the whole
 * `dealKeys.all` scope — the refetch is the truth (the offer-action
 * precedent; no optimistic cache surgery). The 409 family surfaces as a
 * toast with the mapped fa copy, and the invalidated detail re-renders the
 * real state (the card's "409 transitions toast + refresh state").
 */
export function useDealAction() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ code, action, body }: DealActionInput): Promise<DealResponseDto> =>
      dealActionRequest(accessToken(), code, action, body),
    onSuccess: (_deal, { action }) => {
      void queryClient.invalidateQueries({ queryKey: dealKeys.all });
      toast(ACTION_SUCCESS_MESSAGES_FA[action], 'success');
    },
    onError: (error: unknown) => {
      toast(dealErrorMessage(error), 'error');
      void queryClient.invalidateQueries({ queryKey: dealKeys.all });
    },
  });
}
