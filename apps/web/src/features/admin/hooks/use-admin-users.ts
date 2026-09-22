'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/providers/auth-provider';
import { adminKeys } from '../api/keys';
import {
  adminUserDetailRequest,
  adminUsersListRequest,
  adminUserRevokeSessionsAction,
  adminUserRoleAction,
  adminUserStatusAction,
} from '../api/users-api';
import type { AdminUsersFilters } from '../schemas/users-schema';

/**
 * Admin users queries + mutations through the BFF (client-side: the access
 * token lives in memory only — doc/CONVENTIONS.md decision table). Mutations
 * invalidate the user's detail, every list view (filters are part of the key
 * — invalidate the users prefix) AND the overview, whose status counters the
 * actions change.
 */

export function useAdminUsers(filters: AdminUsersFilters) {
  const { accessToken } = useAuth();
  const token = accessToken();
  return useQuery({
    queryKey: adminKeys.users(filters),
    queryFn: () => adminUsersListRequest(token, filters),
    enabled: Boolean(token),
  });
}

export function useAdminUserDetail(id: string) {
  const { accessToken } = useAuth();
  const token = accessToken();
  return useQuery({
    queryKey: adminKeys.user(id),
    queryFn: () => adminUserDetailRequest(token, id),
    enabled: Boolean(token),
  });
}

function useInvalidateUserData() {
  const queryClient = useQueryClient();
  return () => {
    // The actions change status/role/session state: refresh EVERY list filter
    // view (prefix match — filters are part of the key, and the prefix also
    // covers this user's detail key) and the workload overview counters.
    void queryClient.invalidateQueries({ queryKey: [...adminKeys.all, 'users'] });
    void queryClient.invalidateQueries({ queryKey: adminKeys.overview() });
  };
}

export function useAdminUserStatusAction(id: string) {
  const { accessToken } = useAuth();
  const token = accessToken();
  const invalidate = useInvalidateUserData();
  return useMutation({
    mutationFn: (payload: {
      action: 'SUSPEND' | 'BLOCK' | 'ACTIVATE' | 'DELETE';
      reason: string;
    }) => adminUserStatusAction(token, id, payload),
    onSuccess: () => invalidate(),
  });
}

export function useAdminUserRoleAction(id: string) {
  const { accessToken } = useAuth();
  const token = accessToken();
  const invalidate = useInvalidateUserData();
  return useMutation({
    mutationFn: (payload: { role: 'USER' | 'ADMIN'; reason: string }) =>
      adminUserRoleAction(token, id, payload),
    onSuccess: () => invalidate(),
  });
}

export function useAdminUserRevokeSessionsAction(id: string) {
  const { accessToken } = useAuth();
  const token = accessToken();
  const invalidate = useInvalidateUserData();
  return useMutation({
    mutationFn: (payload: { reason: string }) => adminUserRevokeSessionsAction(token, id, payload),
    onSuccess: () => invalidate(),
  });
}
