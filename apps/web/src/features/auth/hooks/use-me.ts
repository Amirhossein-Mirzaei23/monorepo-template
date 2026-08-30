'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/providers/auth-provider';
import { meRequest } from '../api/auth-api';
import { authKeys } from '../api/keys';

/**
 * Current-user query through the BFF. Enabled only with an in-memory access
 * token; the session restore path (AuthProvider) covers the no-token case.
 */
export function useMe() {
  const { accessToken } = useAuth();
  const token = accessToken();
  return useQuery({
    queryKey: authKeys.me(),
    queryFn: () => meRequest(token),
    enabled: Boolean(token),
  });
}
