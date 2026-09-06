'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/providers/auth-provider';
import type { CreateLotDto, LotOwnerResponseDto } from '@monorepo/shared-types';
import { createLotRequest } from '../api/lots-api';
import { lotKeys } from '../api/keys';

/**
 * Create a lot (POST /lots). Success/failure toasts and navigation stay with
 * the wizard — the autosave path needs silent mutations — so this hook only
 * invalidates the lot cache.
 */
export function useCreateLot() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateLotDto): Promise<LotOwnerResponseDto> =>
      createLotRequest(accessToken(), payload),
    onSuccess: (lot) => {
      queryClient.setQueryData(lotKeys.detail(lot.id), lot);
    },
  });
}
