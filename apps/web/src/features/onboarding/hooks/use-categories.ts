'use client';

import { useQuery } from '@tanstack/react-query';
import { categoriesRequest } from '../api/onboarding-api';
import { onboardingKeys } from '../api/keys';

/**
 * Public category tree for the interests step. Public data → longer staleTime
 * than the app default (the taxonomy changes rarely).
 */
export function useCategories() {
  return useQuery({
    queryKey: onboardingKeys.categories(),
    queryFn: categoriesRequest,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
