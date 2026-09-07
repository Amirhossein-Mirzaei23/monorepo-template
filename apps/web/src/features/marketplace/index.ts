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
