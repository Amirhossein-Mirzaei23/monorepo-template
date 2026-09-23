import { parseApiResponse } from '@monorepo/shared-types';
import type { CategoryResponseDto } from '@monorepo/shared-types';
import { apiFetch } from '@/lib/api-client';
import {
  adminCategoriesTreeSchema,
  type AdminCategoryTreeNode,
  type CategoryWritePayload,
} from '../schemas/categories-schema';

/**
 * Admin categories API through the BFF (`/api/admin/categories/**`, admin
 * panel Task 06). The tree response is validated against the generated schema
 * — contract drift fails loudly. Writes reuse the existing admin endpoints
 * (POST create, PATCH update, PATCH :id/reorder); there is deliberately NO
 * delete — deactivation (isActive: false) is the lifecycle.
 */
export async function adminCategoriesTreeRequest(
  token: string | undefined,
): Promise<AdminCategoryTreeNode[]> {
  if (!token) {
    throw new Error('Not authenticated');
  }
  const raw = await apiFetch<unknown>('/api/admin/categories', { token });
  return parseApiResponse(adminCategoriesTreeSchema, raw, 'admin categories tree');
}

export async function adminCategoryCreateRequest(
  token: string | undefined,
  payload: CategoryWritePayload,
): Promise<CategoryResponseDto> {
  if (!token) {
    throw new Error('Not authenticated');
  }
  return apiFetch<CategoryResponseDto>('/api/admin/categories', {
    method: 'POST',
    token,
    body: payload,
  });
}

export async function adminCategoryUpdateRequest(
  token: string | undefined,
  id: string,
  payload: CategoryWritePayload | { isActive: boolean },
): Promise<CategoryResponseDto> {
  if (!token) {
    throw new Error('Not authenticated');
  }
  return apiFetch<CategoryResponseDto>(`/api/admin/categories/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    token,
    body: payload,
  });
}

export async function adminCategoryReorderRequest(
  token: string | undefined,
  id: string,
  siblingId: string,
): Promise<CategoryResponseDto> {
  if (!token) {
    throw new Error('Not authenticated');
  }
  return apiFetch<CategoryResponseDto>(`/api/admin/categories/${encodeURIComponent(id)}/reorder`, {
    method: 'PATCH',
    token,
    body: { siblingId },
  });
}
