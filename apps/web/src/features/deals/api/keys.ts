import type { DealMyRole, DealStatus } from '@monorepo/shared-types';

/** Query keys for the deals feature (TanStack Query) — the offerKeys shape. */
export const dealKeys = {
  all: ['deals'] as const,
  /**
   * Role-aware list pages (GET /deals) — `role` is the tab (buyer=خرید /
   * seller=فروش), `status` the optional chip filter (undefined = every
   * status, the /deals page's default).
   */
  list: (role: DealMyRole, status?: DealStatus) =>
    [...dealKeys.all, 'list', { role, status }] as const,
  /** The detail payload (GET /deals/:code) — keyed by the public code. */
  detail: (code: string) => [...dealKeys.all, 'detail', code] as const,
};
