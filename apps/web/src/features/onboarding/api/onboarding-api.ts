/**
 * Onboarding API access — every call goes through the web BFF
 * (`/api/categories`, `/api/profiles/onboarding`). Responses are validated with
 * the generated zod schemas (contract drift fails loudly).
 */
import {
  categoryTreeNodeSchema,
  parseApiResponse,
  profileResponseSchema,
  type CategoryTreeNodeDto,
  type ProfileResponseDto,
  type SaveOnboardingDto,
} from '@monorepo/shared-types';
import { z } from 'zod';
import { apiFetch } from '@/lib/api-client';

/** Public category tree (two levels, active only) for the interests step. */
export async function categoriesRequest(): Promise<CategoryTreeNodeDto[]> {
  const raw = await apiFetch<unknown>('/api/categories');
  return parseApiResponse(z.array(categoryTreeNodeSchema), raw, 'categories');
}

/** Submit the completed wizard (idempotent PUT — re-onboarding updates). */
export async function saveOnboardingRequest(
  token: string | undefined,
  payload: SaveOnboardingDto,
): Promise<ProfileResponseDto> {
  if (!token) {
    throw new Error('Not authenticated');
  }
  const raw = await apiFetch<unknown>('/api/profiles/onboarding', {
    method: 'PUT',
    token,
    body: payload,
  });
  return parseApiResponse(profileResponseSchema, raw, 'save onboarding');
}
