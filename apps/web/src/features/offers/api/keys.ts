import type { OfferMyRole, OfferStatus } from '@monorepo/shared-types';

/** Query keys for the offers feature (TanStack Query). */
export const offerKeys = {
  all: ['offers'] as const,
  /**
   * Role-aware list pages (GET /offers) — `role` is the tab (buyer=ارسالی /
   * seller=دریافتی), `status` the optional tab filter (undefined = every
   * status, the /offers page's default).
   */
  list: (role: OfferMyRole, status?: OfferStatus) =>
    [...offerKeys.all, 'list', { role, status }] as const,
  /** The seller's per-lot negotiation history (GET /lots/:lotId/offers). */
  lotOffers: (lotId: string) => [...offerKeys.all, 'lot', lotId] as const,
  /**
   * The lot CONTEXT the offer sheet resolves by public code (GET /lots/{code}
   * public detail → OfferSheetLot bounds) — keyed by code because that is all
   * the chat thread and the offer payloads carry.
   */
  lotContext: (code: string) => [...offerKeys.all, 'lot-context', code] as const,
};
