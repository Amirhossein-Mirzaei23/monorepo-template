'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/providers/auth-provider';
import { myProfileRequest } from '../api/profile-api';
import { profileKeys } from '../api/keys';

/**
 * Own-profile query through the BFF (client-side: the access token lives in
 * memory only — doc/CONVENTIONS.md decision table). Enabled only with a token;
 * invalidated by useUpdateProfile after every save.
 */
export function useMyProfile() {
  const { accessToken } = useAuth();
  const token = accessToken();
  return useQuery({
    queryKey: profileKeys.me(),
    queryFn: () => myProfileRequest(token),
    enabled: Boolean(token),
  });
}
