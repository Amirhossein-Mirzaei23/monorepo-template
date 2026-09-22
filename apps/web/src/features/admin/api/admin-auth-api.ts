import {
  parseApiResponse,
  loginResponseSchema,
  type LoginDto,
  type LoginResponseDto,
} from '@monorepo/shared-types';
import { apiFetch } from '@/lib/api-client';

/** Admin password login — the only credential path, through the BFF. */
export async function adminLoginRequest(payload: LoginDto): Promise<LoginResponseDto> {
  const raw = await apiFetch<unknown>('/api/auth/login', { method: 'POST', body: payload });
  return parseApiResponse(loginResponseSchema, raw, 'admin login');
}
