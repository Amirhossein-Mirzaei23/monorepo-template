'use client';

import { useQuery } from '@tanstack/react-query';
import { categoriesRequest } from '../api/categories-api';
import { categoryKeys } from '../api/keys';

/**
 * Public category tree for pickers, chips, filters and home sections.
 * `staleTime` is far longer than the app default (60s) — the taxonomy is
 * admin-managed and near-static (CAT-004), so refetching on every mount is
 * wasted round-trips.
 */
export function useCategories() {
  return useQuery({
    queryKey: categoryKeys.tree(),
    queryFn: categoriesRequest,
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });
}
