'use client';

import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/providers/auth-provider';
import { adminLoginRequest } from '../api/admin-auth-api';

export function useAdminLogin() {
  const { login } = useAuth();
  return useMutation({
    mutationFn: adminLoginRequest,
    onSuccess: login,
  });
}

export { useAdminLogin as useLogin };

export type { AdminLoginFormData } from '../schemas/admin-login-schema';
