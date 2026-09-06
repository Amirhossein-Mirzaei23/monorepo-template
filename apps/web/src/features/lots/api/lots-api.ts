/**
 * Lot API access (LOT-004) — every call goes through the web BFF
 * (`/api/lots*`). Responses are validated with the generated owner schema
 * (contract drift fails loudly). File uploads never pass through here — they
 * go directly to the API from the media feature (MEDIA-004 decision D3).
 */
import {
  lotOwnerResponseSchema,
  parseApiResponse,
  type CreateLotDto,
  type LotOwnerResponseDto,
  type UpdateLotDto,
} from '@monorepo/shared-types';
import { apiFetch } from '@/lib/api-client';
import type { LotMediaPutPayload } from '../types';

/** POST /lots — submit=false saves a DRAFT, submit=true submits for moderation. */
export async function createLotRequest(
  token: string | undefined,
  payload: CreateLotDto,
): Promise<LotOwnerResponseDto> {
  if (!token) {
    throw new Error('Not authenticated');
  }
  const raw = await apiFetch<unknown>('/api/lots', { method: 'POST', token, body: payload });
  return parseApiResponse(lotOwnerResponseSchema, raw, 'create lot');
}

/** GET /lots/:id — owner shape for the edit wizard. */
export async function lotRequest(
  token: string | undefined,
  id: string,
): Promise<LotOwnerResponseDto> {
  if (!token) {
    throw new Error('Not authenticated');
  }
  const raw = await apiFetch<unknown>(`/api/lots/${encodeURIComponent(id)}`, { token });
  return parseApiResponse(lotOwnerResponseSchema, raw, 'lot');
}

/** PATCH /lots/:id — DRAFT/REJECTED fully editable; ACTIVE/PAUSED price/quantity only. */
export async function updateLotRequest(
  token: string | undefined,
  id: string,
  payload: UpdateLotDto,
): Promise<LotOwnerResponseDto> {
  if (!token) {
    throw new Error('Not authenticated');
  }
  const raw = await apiFetch<unknown>(`/api/lots/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    token,
    body: payload,
  });
  return parseApiResponse(lotOwnerResponseSchema, raw, 'update lot');
}

/** PUT /lots/:id/media — replace the whole ordered gallery (DRAFT/REJECTED only). */
export async function updateLotMediaRequest(
  token: string | undefined,
  id: string,
  payload: LotMediaPutPayload,
): Promise<LotOwnerResponseDto> {
  if (!token) {
    throw new Error('Not authenticated');
  }
  const raw = await apiFetch<unknown>(`/api/lots/${encodeURIComponent(id)}/media`, {
    method: 'PUT',
    token,
    body: payload,
  });
  return parseApiResponse(lotOwnerResponseSchema, raw, 'update lot media');
}
