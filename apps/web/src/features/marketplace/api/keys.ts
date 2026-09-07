import type { LotsBrowseFilter } from '../schemas/browse-query';

/** Query keys for the marketplace browse surfaces (TanStack Query). */
export const marketplaceKeys = {
  all: ['marketplace'] as const,
  /**
   * One public listing per URL filter variant — the key is the STRUCTURAL
   * filters object (react-query hashes deep, page/limit stay out via the
   * LotsBrowseFilter type), so every shareable /lots?…&/c/{slug} variant
   * caches independently (frontend-data.md → URL-synced view state).
   */
  list: (filters: LotsBrowseFilter) => [...marketplaceKeys.all, 'list', filters] as const,
};
