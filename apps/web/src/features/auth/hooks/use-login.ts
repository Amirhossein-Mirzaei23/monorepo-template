'use client';

import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/providers/auth-provider';
import { loginRequest } from '../api/auth-api';
import type { LoginFormData } from '../schemas/login-schema';

/** Login mutation — session state lands in AuthProvider on success. */
export function useLogin() {
  const { login } = useAuth();
  return useMutation({
    mutationFn: (payload: LoginFormData) => loginRequest(payload),
    onSuccess: (session) => login(session),
  });
}
