'use client';

import { useMutation } from '@tanstack/react-query';
import { otpRequest } from '../api/auth-api';

/**
 * OTP request mutation (step 1). No session state changes — the response only
 * drives step 2 of the form (resend countdown start, dev-mode code hint).
 */
export function useOtpRequest() {
  return useMutation({
    mutationFn: (phone: string) => otpRequest({ phone, clientType: 'web' }),
  });
}
