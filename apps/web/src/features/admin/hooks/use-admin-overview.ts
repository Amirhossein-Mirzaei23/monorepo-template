'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/providers/auth-provider';
import { adminKeys } from '../api/keys';
import { adminOverviewRequest } from '../api/overview-api';

/**
 * Admin overview query through the BFF (client-side: the access token lives
 * in memory only — doc/CONVENTIONS.md decision table). Enabled only with a
 * token; react-query defaults (staleTime 60s, retry 1) suit an operational
 * dashboard the admin revisits, so no per-query override.
 */
export function useAdminOverview() {
  const { accessToken } = useAuth();
  const token = accessToken();
  return useQuery({
    queryKey: adminKeys.overview(),
    queryFn: () => adminOverviewRequest(token),
    enabled: Boolean(token),
  });
}
