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
  LIQUIDATION_REASON_LABELS_FA,
  LISTED_WITHIN_LABELS_FA,
} from './components/labels';
// --- MKT-006 browse (listing fetchers, hooks, list UI, URL param contract) ---
export { LotList, type LotListProps } from './components/lot-list';
export { useLots, useLotsList, type LotsListState } from './hooks/use-lots';
// --- MKT-004 home (sections, category tiles, public server fetchers) ---
export {
  HomeSection,
  HomeLotGrid,
  SellersStrip,
  EmptySection,
  SectionErrorCard,
  HOME_LOT_LIMIT,
  HOME_SELLER_LIMIT,
  HOME_CATEGORY_LIMIT,
  type HomeSectionProps,
  type HomeLotGridProps,
  type EmptySectionProps,
} from './components/home-sections';
export { CategoryTiles, type CategoryTilesProps } from './components/category-tiles';
// --- MKT-007 search (bar UI, input normalization, recent searches) ---
export { SearchBar, type SearchBarProps } from './components/search-bar';
export { normalizeSearchInput, SEARCH_QUERY_MIN_LENGTH } from './lib/search-normalize';
// --- MKT-008 filters & sort (sheet, sort select, active chips, form mirror) ---
export { FiltersSheet, type FiltersSheetProps } from './components/filters-sheet';
export { SortSelect, SORT_LABELS_FA } from './components/sort-select';
export { ActiveFilterChips } from './components/active-filter-chips';
export {
  EMPTY_FILTERS_FORM,
  filtersFormSchema,
  formValuesFromFilter,
  normalizeNumericInput,
  commitFiltersToParams,
  removeFilterParamValue,
  browseHref,
  FILTER_PARAM_KEYS,
  PRICE_BOUNDS_MESSAGE,
  PRICE_ORDER_MESSAGE,
  QTY_BOUNDS_MESSAGE,
  QTY_ORDER_MESSAGE,
  type FiltersFormValues,
  type ParsedFiltersForm,
} from './schemas/filters-schema';
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
  fetchSellersServer,
  findCategoryBySlug,
  type SellersServerQuery,
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
