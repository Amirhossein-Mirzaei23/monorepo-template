import type { LotStatus, LotUnit } from '@monorepo/shared-types';

/**
 * OFR-004 — the lot context the offer sheet needs. The conversation summary
 * (chat) and the offer payload (OfferLotSummaryDto) only carry the public lot
 * `code`, so the sheet resolves this shape itself via GET /lots/{code} (the
 * PUBLIC detail endpoint — see use-lot-for-offer). `id` is the INTERNAL lot id
 * POST /offers validates (`lotId`); `minOrderQuantity`/`availableQuantity`
 * bound the quantity stepper exactly like the server revalidates.
 */
export interface OfferSheetLot {
  id: string;
  code: string;
  title: string;
  /** The asking per-unit Toman price — the negotiation baseline hint. */
  unitPrice: number;
  unit: LotUnit;
  minOrderQuantity: number;
  availableQuantity: number;
  status: LotStatus;
}
