'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/providers/auth-provider';
import { authKeys } from '@/features/auth';
import { saveOnboardingRequest } from '../api/onboarding-api';
import type { SaveOnboardingDto } from '@monorepo/shared-types';

/**
 * Submit the onboarding wizard. On success the cached `me` query is
 * invalidated so the onboardingCompleted flag refreshes app-wide.
 */
export function useSaveOnboarding() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: SaveOnboardingDto) => saveOnboardingRequest(accessToken(), payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: authKeys.me() });
    },
  });
}
