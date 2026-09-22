'use client';

import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/providers/auth-provider';
import { adminLoginRequest } from '../api/admin-auth-api';

/** Password login mutation: a success lands the session in AuthProvider. */
export function useAdminLogin() {
  const { login } = useAuth();
  return useMutation({
    mutationFn: adminLoginRequest,
    onSuccess: login,
  });
}
