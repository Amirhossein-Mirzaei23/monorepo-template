'use client';

import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/providers/auth-provider';
import { otpVerify } from '../api/auth-api';

/**
 * OTP verify mutation (step 2): a correct code logs the user in (registering
 * the account on first verification). Session state lands in AuthProvider; the
 * mutation result keeps `onboardingCompleted` so the caller can route.
 */
export function useOtpVerify() {
  const { login } = useAuth();
  return useMutation({
    mutationFn: (payload: { phone: string; code: string }) =>
      otpVerify({ ...payload, clientType: 'web' }),
    onSuccess: (session) => login({ accessToken: session.accessToken, user: session.user }),
  });
}
