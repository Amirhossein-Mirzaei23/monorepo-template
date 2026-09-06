import {
  parseApiResponse,
  profileResponseSchema,
  type ProfileResponseDto,
  type UpdateProfileDto,
} from '@monorepo/shared-types';
import { apiFetch } from '@/lib/api-client';

/**
 * Profile API access — every call goes through the web BFF
 * (`/api/profiles/me`). Responses are validated with the generated zod
 * schemas (contract drift fails loudly).
 */

/** Own profile with interests, verification placeholders and trust metrics. */
export async function myProfileRequest(token: string | undefined): Promise<ProfileResponseDto> {
  if (!token) {
    throw new Error('Not authenticated');
  }
  const raw = await apiFetch<unknown>('/api/profiles/me', { token });
  return parseApiResponse(profileResponseSchema, raw, 'my profile');
}

/** Partial update: absent fields untouched, explicit null clears, roles add-only. */
export async function updateMyProfileRequest(
  token: string | undefined,
  payload: UpdateProfileDto,
): Promise<ProfileResponseDto> {
  if (!token) {
    throw new Error('Not authenticated');
  }
  const raw = await apiFetch<unknown>('/api/profiles/me', {
    method: 'PATCH',
    token,
    body: payload,
  });
  return parseApiResponse(profileResponseSchema, raw, 'update profile');
}
