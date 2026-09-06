'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authKeys } from '@/features/auth';
import { ApiError } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/components/ui/toast';
import type { UpdateProfileDto } from '@monorepo/shared-types';
import { updateMyProfileRequest } from '../api/profile-api';
import { profileKeys } from '../api/keys';

/**
 * Save profile edits (PROF-001). On success the own-profile and `me` queries
 * are invalidated so the saved state (and any added accountRole) reflects
 * immediately app-wide — the card's acceptance criterion.
 */
export function useUpdateProfile() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (payload: UpdateProfileDto) => updateMyProfileRequest(accessToken(), payload),
    onSuccess: () => {
      toast('تغییرات پروفایل ذخیره شد', 'success');
      void queryClient.invalidateQueries({ queryKey: profileKeys.me() });
      // Role additions sync User.accountRoles — refresh the session shape too.
      void queryClient.invalidateQueries({ queryKey: authKeys.me() });
    },
    onError: (error) => {
      const detail =
        error instanceof ApiError && typeof error.body?.message === 'string'
          ? error.body.message
          : undefined;
      toast(
        detail
          ? `ذخیره تغییرات ناموفق بود — ${detail}`
          : 'ذخیره تغییرات ناموفق بود — دوباره تلاش کنید',
        'error',
      );
    },
  });
}
