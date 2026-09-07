/**
 * Public API (barrel) of the marketplace feature — the only import path other
 * modules may use (doc/ARCHITECTURE.md → Frontend rules). Consumed by the home
 * sections (MKT-004), the browse grid + hooks (MKT-006), the lot detail
 * (MKT-009), saved lists (SAV-002) and seller profiles (PROF-002).
 */
export {
  LotCard,
  LotCardSkeleton,
  type LotCardProps,
  type LotCardSkeletonProps,
  type LotCardVariant,
} from './components/lot-card';
export { ConditionChip } from './components/condition-chip';
export { VerifiedBadge } from './components/verified-badge';
export {
  LOT_CONDITION_LABELS_FA,
  LOT_UNIT_LABELS_FA,
  PRICING_TYPE_LABELS_FA,
} from './components/labels';
// --- MKT-006 browse (listing fetchers, hooks, list UI, URL param contract) ---
export { LotList, type LotListProps } from './components/lot-list';
export { useLots, useLotsList, type LotsListState } from './hooks/use-lots';
// --- MKT-007 search (bar UI, input normalization, recent searches) ---
export { SearchBar, type SearchBarProps } from './components/search-bar';
export { normalizeSearchInput, SEARCH_QUERY_MIN_LENGTH } from './lib/search-normalize';
export {
  readRecentSearches,
  addRecentSearch,
  removeRecentSearch,
  clearRecentSearches,
  RECENT_SEARCHES_KEY,
  RECENT_SEARCHES_MAX,
  type RecentSearchesStorage,
} from './lib/recent-searches';
export {
  fetchLots,
  fetchLotsServer,
  fetchCategoriesServer,
  findCategoryBySlug,
} from './api/marketplace-api';
export { marketplaceKeys } from './api/keys';
export {
  lotCardPageSchema,
  lotsBrowseQueryString,
  parseLotsBrowseParams,
  LOT_LIST_PAGE_SIZE,
  LOTS_BROWSE_SORTS,
  LOTS_LISTED_WITHIN_OPTIONS,
  LOTS_FILTER_MAX_PRICE,
  LOTS_FILTER_MAX_QUANTITY,
  type LotsBrowseFilter,
  type LotsBrowseQuery,
  type LotCardPage,
  type LotsBrowseSort,
  type LotsListedWithin,
} from './schemas/browse-query';
