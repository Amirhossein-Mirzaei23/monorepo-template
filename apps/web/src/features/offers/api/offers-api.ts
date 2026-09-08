/**
 * Offers API access (OFR-004) — every call goes through the web BFF
 * (`/api/offers*`, `/api/lots/:id/offers`), with payloads validated against
 * the generated-contract schemas so drift fails loudly (`parseApiResponse`),
 * like every other feature fetcher.
 */
import {
  lotPublicDetailResponseSchema,
  offerResponseSchema,
  offersPageSchema,
  parseApiResponse,
  type CounterOfferDto,
  type CreateOfferDto,
  type LotPublicDetailResponseDto,
  type OfferMyRole,
  type OfferResponseDto,
  type OfferStatus,
  type Paginated,
} from '@monorepo/shared-types';
import { apiFetch } from '@/lib/api-client';
import type { OfferSheetLot } from '../types';

/** Offers list page size — mobile scroll pace (the lots/mine precedent). */
export const OFFERS_PAGE_SIZE = 10;

export interface OffersQuery {
  role: OfferMyRole;
  status?: OfferStatus;
  page?: number;
  limit?: number;
}

/**
 * GET /offers — the role-aware list (role=buyer: offers I made = ارسالی;
 * role=seller: offers on my lots = دریافتی). Not seller-hat-gated server-side,
 * so both tabs render for every account (a buyer's دریافتی is just empty).
 */
export async function fetchOffers(
  token: string | undefined,
  query: OffersQuery,
): Promise<Paginated<OfferResponseDto>> {
  if (!token) {
    throw new Error('Not authenticated');
  }
  const params = new URLSearchParams({ role: query.role });
  if (query.status !== undefined) {
    params.set('status', query.status);
  }
  if (query.page !== undefined) {
    params.set('page', String(query.page));
  }
  if (query.limit !== undefined) {
    params.set('limit', String(query.limit));
  }
  const raw = await apiFetch<unknown>(`/api/offers?${params.toString()}`, { token });
  return parseApiResponse(offersPageSchema, raw, 'offers');
}

/** POST /offers — buyer create (201; the ACTION message into a tied thread is server-side). */
export async function createOfferRequest(
  token: string | undefined,
  payload: CreateOfferDto,
): Promise<OfferResponseDto> {
  if (!token) {
    throw new Error('Not authenticated');
  }
  const raw = await apiFetch<unknown>('/api/offers', { method: 'POST', token, body: payload });
  return parseApiResponse(offerResponseSchema, raw, 'create offer');
}

/** The offer action allowlist — mirrors the BFF route's set exactly. */
export type OfferAction = 'counter' | 'accept' | 'reject' | 'cancel';

/** POST /offers/:id/<action> — counter carries the CounterOfferDto body (201), the decisions are body-less (200); every answer is the fresh offer. */
export async function offerActionRequest(
  token: string | undefined,
  id: string,
  action: OfferAction,
  payload?: CounterOfferDto,
): Promise<OfferResponseDto> {
  if (!token) {
    throw new Error('Not authenticated');
  }
  const raw = await apiFetch<unknown>(`/api/offers/${encodeURIComponent(id)}/${action}`, {
    method: 'POST',
    token,
    ...(payload !== undefined ? { body: payload } : {}),
  });
  return parseApiResponse(offerResponseSchema, raw, `${action} offer`);
}

/** GET /lots/:lotId/offers — the seller's per-lot negotiation history. */
export async function fetchLotOffers(
  token: string | undefined,
  lotId: string,
  query: { page?: number; limit?: number } = {},
): Promise<Paginated<OfferResponseDto>> {
  if (!token) {
    throw new Error('Not authenticated');
  }
  const params = new URLSearchParams();
  if (query.page !== undefined) {
    params.set('page', String(query.page));
  }
  if (query.limit !== undefined) {
    params.set('limit', String(query.limit));
  }
  const search = params.toString();
  const raw = await apiFetch<unknown>(
    `/api/lots/${encodeURIComponent(lotId)}/offers${search ? `?${search}` : ''}`,
    { token },
  );
  return parseApiResponse(offersPageSchema, raw, 'lot offers');
}

/**
 * GET /lots/{code} — the PUBLIC detail payload, addressed by the public code
 * (the API dispatches on key shape), reduced to the sheet's lot context: the
 * internal id + live quantity bounds the create/counter validation mirrors.
 * Goes through the existing BFF route; the auth forward is best-effort (the
 * endpoint is @Public — the token only aids request-id correlation).
 */
export async function fetchLotForOffer(code: string, token?: string): Promise<OfferSheetLot> {
  const raw = await apiFetch<unknown>(`/api/lots/${encodeURIComponent(code)}`, { token });
  const detail = parseApiResponse(lotPublicDetailResponseSchema, raw, 'lot (offer context)');
  return offerSheetLotFromDetail(detail);
}

/** Maps the public detail payload onto the sheet's lot context shape. */
export function offerSheetLotFromDetail(detail: LotPublicDetailResponseDto): OfferSheetLot {
  return {
    id: detail.id,
    code: detail.code,
    title: detail.title,
    unitPrice: detail.unitPrice,
    unit: detail.unit,
    minOrderQuantity: detail.minOrderQuantity,
    availableQuantity: detail.availableQuantity,
    status: detail.status,
  };
}
