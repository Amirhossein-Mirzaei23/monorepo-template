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
  type LotStatus,
  type Paginated,
  type UpdateLotDto,
} from '@monorepo/shared-types';
import { apiFetch } from '@/lib/api-client';
import { lotMinePageSchema } from '../schemas/lot-schema';
import type { LotMediaPutPayload } from '../types';

/** Tab filter for GET /lots/mine — a real status, or `all` (the merged فعال tab). */
export type MineStatusFilter = LotStatus | 'all';

export interface MyLotsQuery {
  status?: MineStatusFilter;
  page?: number;
  limit?: number;
}

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

/** GET /lots/mine — paginated seller inventory, newest first (LOT-005). */
export async function myLotsRequest(
  token: string | undefined,
  query: MyLotsQuery = {},
): Promise<Paginated<LotOwnerResponseDto>> {
  if (!token) {
    throw new Error('Not authenticated');
  }
  const params = new URLSearchParams();
  if (query.status !== undefined && query.status !== 'all') {
    params.set('status', query.status);
  }
  if (query.page !== undefined) {
    params.set('page', String(query.page));
  }
  if (query.limit !== undefined) {
    params.set('limit', String(query.limit));
  }
  const search = params.toString();
  const raw = await apiFetch<unknown>(`/api/lots/mine${search ? `?${search}` : ''}`, { token });
  return parseApiResponse(lotMinePageSchema, raw, 'my lots');
}

/**
 * POST /lots/:id/<action> — the LOT-003 lifecycle endpoints the my-lots UI
 * exposes (`duplicate` returns 201, the rest 200; every body is the fresh
 * owner shape).
 */
export type LotLifecycleAction = 'pause' | 'resume' | 'mark-sold' | 'duplicate';

export async function lotActionRequest(
  token: string | undefined,
  id: string,
  action: LotLifecycleAction,
): Promise<LotOwnerResponseDto> {
  if (!token) {
    throw new Error('Not authenticated');
  }
  const raw = await apiFetch<unknown>(`/api/lots/${encodeURIComponent(id)}/${action}`, {
    method: 'POST',
    token,
  });
  return parseApiResponse(lotOwnerResponseSchema, raw, `${action} lot`);
}

/** DELETE /lots/:id — soft delete to REMOVED (200 with the removed owner body). */
export async function deleteLotRequest(
  token: string | undefined,
  id: string,
): Promise<LotOwnerResponseDto> {
  if (!token) {
    throw new Error('Not authenticated');
  }
  const raw = await apiFetch<unknown>(`/api/lots/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    token,
  });
  return parseApiResponse(lotOwnerResponseSchema, raw, 'delete lot');
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
