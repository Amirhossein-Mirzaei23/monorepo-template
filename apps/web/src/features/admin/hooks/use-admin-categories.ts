'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { categoryKeys } from '@/features/categories';
import { useAuth } from '@/providers/auth-provider';
import { adminKeys } from '../api/keys';
import {
  adminCategoriesTreeRequest,
  adminCategoryCreateRequest,
  adminCategoryReorderRequest,
  adminCategoryUpdateRequest,
} from '../api/categories-api';
import type { CategoryWritePayload } from '../schemas/categories-schema';

/**
 * Admin categories queries + mutations through the BFF (client-side: the
 * access token lives in memory only — doc/CONVENTIONS.md decision table).
 * EVERY mutation invalidates BOTH the admin tree AND the public categories
 * feature tree (categoryKeys, via the categories feature barrel — the only
 * sanctioned cross-feature import path): deactivation/reordering must be
 * visible to the marketplace pickers on their next mount without a deploy
 * (Task 06 step 7).
 */
export function useAdminCategories() {
  const { accessToken } = useAuth();
  const token = accessToken();
  return useQuery({
    queryKey: adminKeys.categories(),
    queryFn: () => adminCategoriesTreeRequest(token),
    enabled: Boolean(token),
  });
}

/** One invalidator for every write — the admin editor and the public tree move together. */
function useInvalidateCategories() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: adminKeys.categories() });
    void queryClient.invalidateQueries({ queryKey: categoryKeys.tree() });
  };
}

export function useCreateCategory() {
  const { accessToken } = useAuth();
  const token = accessToken();
  const invalidate = useInvalidateCategories();
  return useMutation({
    mutationFn: (payload: CategoryWritePayload) => adminCategoryCreateRequest(token, payload),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateCategory() {
  const { accessToken } = useAuth();
  const token = accessToken();
  const invalidate = useInvalidateCategories();
  return useMutation({
    mutationFn: (input: { id: string; payload: CategoryWritePayload | { isActive: boolean } }) =>
      adminCategoryUpdateRequest(token, input.id, input.payload),
    onSuccess: () => invalidate(),
  });
}

export function useReorderCategory() {
  const { accessToken } = useAuth();
  const token = accessToken();
  const invalidate = useInvalidateCategories();
  return useMutation({
    mutationFn: (input: { id: string; siblingId: string }) =>
      adminCategoryReorderRequest(token, input.id, input.siblingId),
    onSuccess: () => invalidate(),
  });
}
