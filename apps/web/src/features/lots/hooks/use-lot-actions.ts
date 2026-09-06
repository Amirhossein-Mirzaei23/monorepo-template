'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LotOwnerResponseDto } from '@monorepo/shared-types';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';
import { deleteLotRequest, lotActionRequest, type LotLifecycleAction } from '../api/lots-api';
import { lotKeys } from '../api/keys';

/** Persian copy per machine error code (LOT-002/003 — LOT_ERROR_CODES). */
const ACTION_ERROR_MESSAGES_FA: Record<string, string> = {
  SELLER_REQUIRED: 'برای این کار ابتدا باید فروشنده شوید',
  ILLEGAL_TRANSITION: 'این عمل در وضعیت فعلی آگهی امکان‌پذیر نیست',
  ILLEGAL_STATUS_EDIT: 'این آگهی در وضعیت فعلی قابل ویرایش نیست',
  EXPIRED: 'مهلت این آگهی تمام شده است — یک کپی از آن بسازید',
};

function actionErrorMessage(error: unknown): string {
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

/** Success toast copy per action (the row stays for state — no redirects). */
const ACTION_SUCCESS_MESSAGES_FA: Record<LotLifecycleAction | 'delete', string> = {
  pause: 'آگهی موقتاً غیرفعال شد و از نمایش عمومی پنهان است',
  resume: 'آگهی دوباره فعال شد',
  'mark-sold': 'آگهی به‌عنوان فروخته‌شده ثبت شد',
  duplicate: 'کپی آگهی در پیش‌نویس‌ها ساخته شد',
  delete: 'آگهی حذف شد',
};

/**
 * LOT-003 lifecycle mutations for the my-lots rows (LOT-005). Every action
 * moves a lot across tabs, so success invalidates the whole `lotKeys.all`
 * scope (frontend-data.md: status-affecting changes) — no optimistic cache
 * surgery; the refetch is the truth. Failures surface the API's Persian-safe
 * mapped message via toast, and the invalidated list self-corrects.
 */
export function useLotAction() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: string;
      action: LotLifecycleAction;
    }): Promise<LotOwnerResponseDto> => lotActionRequest(accessToken(), id, action),
    onSuccess: (_lot, { action }) => {
      void queryClient.invalidateQueries({ queryKey: lotKeys.all });
      toast(ACTION_SUCCESS_MESSAGES_FA[action], 'success');
    },
    onError: (error: unknown) => {
      toast(actionErrorMessage(error), 'error');
      void queryClient.invalidateQueries({ queryKey: lotKeys.all });
    },
  });
}

/** DELETE /lots/:id — same invalidation contract as the lifecycle actions. */
export function useDeleteLot() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ id }: { id: string }): Promise<LotOwnerResponseDto> =>
      deleteLotRequest(accessToken(), id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: lotKeys.all });
      toast(ACTION_SUCCESS_MESSAGES_FA.delete, 'success');
    },
    onError: (error: unknown) => {
      toast(actionErrorMessage(error), 'error');
      void queryClient.invalidateQueries({ queryKey: lotKeys.all });
    },
  });
}
