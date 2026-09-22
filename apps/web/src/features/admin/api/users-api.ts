import { parseApiResponse } from '@monorepo/shared-types';
import type {
  AdminUserDetailDto,
  AdminUsersListResponseDto,
  RevokeSessionsResponseDto,
  AdminUserResponseDto,
  UpdateUserRoleDto,
  UpdateUserStatusDto,
} from '@monorepo/shared-types';
import { apiFetch } from '@/lib/api-client';
import {
  adminUserDetailResponseSchema,
  adminUsersListSchema,
  type AdminUsersFilters,
} from '../schemas/users-schema';

/**
 * Admin users API through the BFF (`/api/admin/users/**`, admin panel Task
 * 05). Responses are validated against the generated schemas — contract drift
 * fails loudly. Mutations are the narrow, reason-carrying actions; the API's
 * 409 guards (self-action / last-active-admin) surface as typed ApiErrors the
 * components render.
 */

/** Builds the BFF query string from the URL-derived filter state. */
export function adminUsersQueryString(filters: AdminUsersFilters): string {
  const params = new URLSearchParams();
  if (filters.q) {
    params.set('q', filters.q);
  }
  if (filters.role) {
    params.set('role', filters.role);
  }
  if (filters.status) {
    params.set('status', filters.status);
  }
  if (filters.accountRole) {
    params.set('accountRole', filters.accountRole);
  }
  if (filters.onboarded !== undefined) {
    params.set('onboarded', String(filters.onboarded));
  }
  if (filters.page !== undefined && filters.page > 1) {
    params.set('page', String(filters.page));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

export async function adminUsersListRequest(
  token: string | undefined,
  filters: AdminUsersFilters,
): Promise<AdminUsersListResponseDto> {
  if (!token) {
    throw new Error('Not authenticated');
  }
  const raw = await apiFetch<unknown>(`/api/admin/users${adminUsersQueryString(filters)}`, {
    token,
  });
  return parseApiResponse(adminUsersListSchema, raw, 'admin users list');
}

export async function adminUserDetailRequest(
  token: string | undefined,
  id: string,
): Promise<AdminUserDetailDto> {
  if (!token) {
    throw new Error('Not authenticated');
  }
  const raw = await apiFetch<unknown>(`/api/admin/users/${encodeURIComponent(id)}`, { token });
  return parseApiResponse(adminUserDetailResponseSchema, raw, 'admin user detail');
}

export async function adminUserStatusAction(
  token: string | undefined,
  id: string,
  payload: UpdateUserStatusDto,
): Promise<AdminUserResponseDto> {
  if (!token) {
    throw new Error('Not authenticated');
  }
  return apiFetch<AdminUserResponseDto>(`/api/admin/users/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    token,
    body: payload,
  });
}

export async function adminUserRoleAction(
  token: string | undefined,
  id: string,
  payload: UpdateUserRoleDto,
): Promise<AdminUserResponseDto> {
  if (!token) {
    throw new Error('Not authenticated');
  }
  return apiFetch<AdminUserResponseDto>(`/api/admin/users/${encodeURIComponent(id)}/role`, {
    method: 'PATCH',
    token,
    body: payload,
  });
}

export async function adminUserRevokeSessionsAction(
  token: string | undefined,
  id: string,
  payload: { reason: string },
): Promise<RevokeSessionsResponseDto> {
  if (!token) {
    throw new Error('Not authenticated');
  }
  return apiFetch<RevokeSessionsResponseDto>(
    `/api/admin/users/${encodeURIComponent(id)}/revoke-sessions`,
    { method: 'POST', token, body: payload },
  );
}
