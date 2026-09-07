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
// --- MKT-009 detail (detail surface, gallery, spec block, seller summary) ---
export { LotDetail, type LotDetailProps } from './components/lot-detail';
export { MediaGallery } from './components/media-gallery';
export { SpecBlock } from './components/spec-block';
export { SellerSummary } from './components/seller-summary';
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
  fetchLotDetailServer,
  fetchCategoriesServer,
  fetchSellersServer,
  findCategoryBySlug,
  type SellersServerQuery,
} from './api/marketplace-api';
/**
 * PROF-002 — the MKT-010 share builders/actions for the seller page (/s/{id}):
 * same native-share-then-sheet mechanics as shareLot, with the seller fa text
 * and the /s/{id} URL (no price segment — a seller page has no single price).
 */
/**
 * MKT-010 + PROF-002 — share builders/actions. The lot set powers the /l/{code}
 * share sheet; the seller set re-runs the same mechanics on the /s/{id} URL
 * with the seller fa text (no price segment — a seller page has no single
 * price). Exported so dependent features (profiles) consume them via the
 * barrel, per the cross-feature import rule.
 */
export {
  buildLotShareText,
  buildLotShareUrl,
  buildTelegramUrl,
  buildWhatsappUrl,
  copyLotLink,
  shareLot,
  buildSellerShareText,
  buildSellerShareUrl,
  shareSeller,
  copySellerLink,
  type ShareLotInput,
  type ShareLotOutcome,
  type CopyLinkOutcome,
  type SellerShareInfo,
  type ShareSellerInput,
} from './lib/share';
/**
 * Test fixtures (MKT-009) — contract-shaped payloads for suites OUTSIDE the
 * feature (route-group page tests cannot deep-import into features/, so the
 * fixture travels through the barrel like every other export; the zod-validated
 * page test then fails loudly if the fixture drifts from the contract).
 * cardLotFixture also feeds dependent features' fixtures (PROF-002 seller page).
 */
export { lotDetailFixture, cardLotFixture } from './testing/fixtures';
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
