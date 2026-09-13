/**
 * Public API (barrel) of the deals feature — the only import path other
 * modules may use (doc/ARCHITECTURE.md → Frontend rules). Consumed by the
 * (app) routes; the offers feature's «ایجاد معامله» wiring is a documented
 * follow-up (deal creation UI is not part of DEAL-004's files).
 */
// --- API access ---
export {
  fetchDeals,
  fetchDealDetail,
  dealActionRequest,
  DEALS_PAGE_SIZE,
  type DealAction,
  type DealsQuery,
} from './api/deals-api';
export { dealKeys } from './api/keys';
// --- schemas (labels + the client-side matrix mirror) ---
export {
  DEAL_STATUS_LABELS_FA,
  DELIVERY_METHOD_LABELS_FA,
  PAYMENT_METHOD_LABELS_FA,
  DEAL_DISPUTE_REASON_MIN_LENGTH,
  DEAL_NOTE_MAX_LENGTH,
  cancelReasonSchema,
  disputeReasonSchema,
  dealActionsFor,
  dealActionWaitingHint,
  dealPaymentAnnounced,
  type DealActionKind,
  type DealActionView,
} from './schemas/deal-schema';
// --- hooks ---
export { useDeals, useDealsList, useDealDetail, type DealsListState } from './hooks/use-deals';
export { useDealAction, dealErrorMessage, type DealActionInput } from './hooks/use-deal-actions';
// --- components ---
export { DealStatusChip } from './components/deal-status-chip';
export { DealCard, type DealCardProps } from './components/deal-card';
export { StatusTimeline } from './components/status-timeline';
export { DealDetail } from './components/deal-detail';
export { DealsPage } from './components/deals-page';
// --- test fixtures (contract-exact; travel through the barrel like the
// offers precedent so route-group tests never deep-import) ---
export { dealFixture, dealsPageFixture, dealDetailFixture } from './testing/fixtures';
