import {
  parseApiResponse,
  loginResponseSchema,
  type LoginDto,
  type LoginResponseDto,
} from '@monorepo/shared-types';
import { apiFetch } from '@/lib/api-client';

export async function adminLoginRequest(payload: LoginDto): Promise<LoginResponseDto> {
  const raw = await apiFetch<unknown>('/api/auth/login', { method: 'POST', body: payload });
  return parseApiResponse(loginResponseSchema, raw, 'admin login');
}

export async function adminLogoutRequest(): Promise<void> {
  await apiFetch<void>('/api/auth/logout', { method: 'POST' });
}

export { adminLoginRequest as loginRequest };

export type { LoginDto };
