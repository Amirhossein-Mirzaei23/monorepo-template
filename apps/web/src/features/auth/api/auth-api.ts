import {
  parseApiResponse,
  type LoginResponseDto,
  type UserResponseDto,
} from '@monorepo/shared-types';
import { loginResponseSchema, userResponseSchema } from '@monorepo/shared-types';
import { apiFetch } from '@/lib/api-client';
import type { LoginFormData } from '../schemas/login-schema';

/**
 * Auth API access — every call goes through the web BFF (`/api/auth/*`), which
 * proxies to the NestJS API and owns the httpOnly refresh cookie. Responses are
 * validated with the generated zod schemas (contract drift fails loudly).
 */
export async function loginRequest(payload: LoginFormData): Promise<LoginResponseDto> {
  const raw = await apiFetch<unknown>('/api/auth/login', { method: 'POST', body: payload });
  return parseApiResponse(loginResponseSchema, raw, 'login');
}

export async function refreshRequest(): Promise<LoginResponseDto> {
  const raw = await apiFetch<unknown>('/api/auth/refresh', { method: 'POST' });
  return parseApiResponse(loginResponseSchema, raw, 'refresh');
}

export async function logoutRequest(): Promise<void> {
  await apiFetch<void>('/api/auth/logout', { method: 'POST' });
}

export async function meRequest(token: string | undefined): Promise<UserResponseDto> {
  if (!token) {
    throw new Error('Not authenticated');
  }
  const raw = await apiFetch<unknown>('/api/auth/me', { token });
  return parseApiResponse(userResponseSchema, raw, 'profile');
}
