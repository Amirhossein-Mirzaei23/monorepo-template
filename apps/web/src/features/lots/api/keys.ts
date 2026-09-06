import type { LotStatus } from '@monorepo/shared-types';

/** Query keys for the lots feature (TanStack Query). */
export const lotKeys = {
  all: ['lots'] as const,
  /** Owner-shape detail by internal id (edit wizard / my-lots actions). */
  detail: (id: string) => [...lotKeys.all, 'detail', id] as const,
  /**
   * Seller inventory pages (GET /lots/mine) per tab — `all` is the UI sentinel
   * for the merged فعال tab (ACTIVE + PAUSED), a real LotStatus otherwise.
   */
  mine: (status: LotStatus | 'all') => [...lotKeys.all, 'mine', status] as const,
};
