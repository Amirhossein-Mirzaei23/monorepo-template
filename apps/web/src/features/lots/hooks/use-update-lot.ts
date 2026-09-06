'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/providers/auth-provider';
import type { LotOwnerResponseDto, UpdateLotDto } from '@monorepo/shared-types';
import { updateLotRequest } from '../api/lots-api';
import { lotKeys } from '../api/keys';

export interface UpdateLotArgs {
  id: string;
  payload: UpdateLotDto;
}

/**
 * Edit a lot (PATCH /lots/:id). Used by the review-step save, the ACTIVE/PAUSED
 * pricing-only editor AND the debounced draft autosave (which requires silence
 * — toasts live in the wizard, not here).
 */
export function useUpdateLot() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: UpdateLotArgs): Promise<LotOwnerResponseDto> =>
      updateLotRequest(accessToken(), id, payload),
    onSuccess: (lot) => {
      queryClient.setQueryData(lotKeys.detail(lot.id), lot);
    },
  });
}
