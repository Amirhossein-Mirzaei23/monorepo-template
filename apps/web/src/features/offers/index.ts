/**
 * Public API (barrel) of the offers feature — the only import path other
 * modules may use (doc/ARCHITECTURE.md → Frontend rules). Consumed by the
 * chat thread (OFR-004 ACTION bubbles + the CHT-008 «پیشنهاد قیمت» chip
 * opening the shared sheet).
 */
export type { OfferSheetLot } from './types';
// --- API access ---
export {
  fetchOffers,
  fetchLotForOffer,
  fetchLotOffers,
  createOfferRequest,
  offerActionRequest,
  offerSheetLotFromDetail,
  OFFERS_PAGE_SIZE,
  type OfferAction,
  type OffersQuery,
} from './api/offers-api';
export { offerKeys } from './api/keys';
// --- schemas (zod mirror + fa labels) ---
export {
  OFFER_STATUS_LABELS_FA,
  OFFER_MIN_UNIT_PRICE,
  OFFER_MAX_UNIT_PRICE,
  OFFER_MAX_TOTAL_PRICE,
  OFFER_NOTE_MAX_LENGTH,
  makeOfferFormSchema,
  parseFaPositiveInteger,
  type OfferFormValues,
  type OfferFormParsed,
} from './schemas/offer-schema';
// --- hooks ---
export { useOffers, useOffersList, type OffersListState } from './hooks/use-offers';
export {
  useOfferAction,
  useSubmitOffer,
  offerErrorMessage,
  type CardOfferAction,
  type SubmitOfferPayload,
} from './hooks/use-offer-actions';
export { useLotForOffer, type LotForOfferState } from './hooks/use-lot-for-offer';
// --- components ---
export { OfferStatusChip } from './components/offer-status-chip';
export { OfferCard, type OfferCardProps } from './components/offer-card';
export { OfferSheet, type OfferSheetProps } from './components/offer-sheet';
export {
  OfferActionBubble,
  offerStatusFromBody,
  type OfferActionBubbleProps,
} from './components/offer-history';
export { OffersPage } from './components/offers-page';
// --- test fixtures (contract-exact; travel through the barrel like the
// marketplace precedent so route-group tests never deep-import) ---
export { offerFixture, offersPageFixture } from './testing/fixtures';
