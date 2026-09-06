'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/providers/auth-provider';
import type { LotOwnerResponseDto } from '@monorepo/shared-types';
import { updateLotMediaRequest } from '../api/lots-api';
import { lotKeys } from '../api/keys';
import type { LotMediaPutPayload } from '../types';

export interface UpdateLotMediaArgs {
  id: string;
  payload: LotMediaPutPayload;
}

/**
 * Replace a lot's ordered gallery (PUT /lots/:id/media). Only legal while
 * DRAFT/REJECTED (upstream 409 otherwise); the wizard choreographs it after
 * the lot JSON is saved — media ids cannot attach before a lot exists.
 */
export function useUpdateLotMedia() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: UpdateLotMediaArgs): Promise<LotOwnerResponseDto> =>
      updateLotMediaRequest(accessToken(), id, payload),
    onSuccess: (lot) => {
      queryClient.setQueryData(lotKeys.detail(lot.id), lot);
    },
  });
}
