import {
  parseApiResponse,
  type LoginResponseDto,
  type OtpRequestDto,
  type OtpRequestResponseDto,
  type OtpVerifyDto,
  type OtpVerifyResponseDto,
  type UserResponseDto,
} from '@monorepo/shared-types';
import {
  loginResponseSchema,
  otpRequestResponseSchema,
  otpVerifyResponseSchema,
  userResponseSchema,
} from '@monorepo/shared-types';
import { apiFetch } from '@/lib/api-client';

/**
 * Auth API access — every call goes through the web BFF (`/api/auth/*`), which
 * proxies to the NestJS API and owns the httpOnly refresh cookie. Responses are
 * validated with the generated zod schemas (contract drift fails loudly).
 */

/** Step 1 of phone login: ask the API to SMS a 6-digit code to `phone`. */
export async function otpRequest(payload: OtpRequestDto): Promise<OtpRequestResponseDto> {
  const raw = await apiFetch<unknown>('/api/auth/otp/request', { method: 'POST', body: payload });
  return parseApiResponse(otpRequestResponseSchema, raw, 'otp request');
}

/** Step 2 of phone login: exchange the code for a session (login-or-register). */
export async function otpVerify(payload: OtpVerifyDto): Promise<OtpVerifyResponseDto> {
  const raw = await apiFetch<unknown>('/api/auth/otp/verify', { method: 'POST', body: payload });
  return parseApiResponse(otpVerifyResponseSchema, raw, 'otp verify');
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
