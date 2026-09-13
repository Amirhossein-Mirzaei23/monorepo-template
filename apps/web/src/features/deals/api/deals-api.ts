/**
 * Deals API access (DEAL-004) — every call goes through the web BFF
 * (`/api/deals*`), payloads validated against the generated-contract schemas
 * (`parseApiResponse`) so drift fails loudly, like every other feature
 * fetcher.
 */
import {
  dealDetailResponseSchema,
  dealResponseSchema,
  dealsPageSchema,
  parseApiResponse,
  type DealDetailResponseDto,
  type DealMyRole,
  type DealResponseDto,
  type DealStatus,
  type Paginated,
  type TransitionDealDto,
} from '@monorepo/shared-types';
import { apiFetch } from '@/lib/api-client';

/** Deals list page size — mobile scroll pace (the offers precedent). */
export const DEALS_PAGE_SIZE = 10;

export interface DealsQuery {
  role: DealMyRole;
  status?: DealStatus;
  page?: number;
  limit?: number;
}

/**
 * GET /deals — the role-aware list (role=buyer: deals I struck = خرید;
 * role=seller: deals on my lots = فروش).
 */
export async function fetchDeals(
  token: string | undefined,
  query: DealsQuery,
): Promise<Paginated<DealResponseDto>> {
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
  const raw = await apiFetch<unknown>(`/api/deals?${params.toString()}`, { token });
  return parseApiResponse(dealsPageSchema, raw, 'deals');
}

/** GET /deals/:code — the detail payload (allowlisted deal + the timeline). */
export async function fetchDealDetail(
  token: string | undefined,
  code: string,
): Promise<DealDetailResponseDto> {
  if (!token) {
    throw new Error('Not authenticated');
  }
  const raw = await apiFetch<unknown>(`/api/deals/${encodeURIComponent(code)}`, { token });
  return parseApiResponse(dealDetailResponseSchema, raw, 'deal detail');
}

/** The deal action allowlist — mirrors the BFF route's set exactly. */
export type DealAction = 'transition' | 'cancel' | 'payment-confirm';

/**
 * POST /deals/:code/<action> — `transition` carries the TransitionDealDto body
 * ({to, note?}), `cancel` the reason body ({reason}), `payment-confirm` is
 * body-less; every answer is the fresh allowlisted deal.
 */
export async function dealActionRequest(
  token: string | undefined,
  code: string,
  action: DealAction,
  payload?: TransitionDealDto | { reason: string },
): Promise<DealResponseDto> {
  if (!token) {
    throw new Error('Not authenticated');
  }
  const raw = await apiFetch<unknown>(`/api/deals/${encodeURIComponent(code)}/${action}`, {
    method: 'POST',
    token,
    ...(payload !== undefined ? { body: payload } : {}),
  });
  return parseApiResponse(dealResponseSchema, raw, `${action} deal`);
}
