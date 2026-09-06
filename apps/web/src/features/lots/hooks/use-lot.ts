'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/providers/auth-provider';
import { lotRequest } from '../api/lots-api';
import { lotKeys } from '../api/keys';

/**
 * Owner-shape lot query (GET /lots/:id) for the edit wizard. Enabled only with
 * an in-memory access token. Default staleTime/retry apply — the wizard
 * hydrates from this once and keeps its own form state afterwards.
 */
export function useLot(id: string | undefined) {
  const { accessToken } = useAuth();
  const token = accessToken();
  return useQuery({
    queryKey: lotKeys.detail(id ?? ''),
    queryFn: () => lotRequest(token, id as string),
    enabled: Boolean(token) && Boolean(id),
  });
}
