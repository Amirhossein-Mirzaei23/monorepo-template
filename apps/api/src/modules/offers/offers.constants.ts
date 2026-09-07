import { ConflictException } from '@nestjs/common';
// OfferStatus is used as a VALUE below (transition-table targets), unlike the
// label maps which only type it.
import { OfferStatus } from '@prisma/client';

/**
 * Persian display labels for the Offer enums (plan §3) — the single source the
 * web app renders through generated API types; never hardcode fa strings in
 * components. Keys are exhaustive per enum (Record<Enum, string> keeps the map
 * compile-time synced with the Prisma enum).
 */
export const OFFER_STATUS_LABELS_FA: Record<OfferStatus, string> = {
  PENDING: 'در انتظار پاسخ',
  COUNTERED: 'پیشنهاد متقابل',
  ACCEPTED: 'پذیرفته شده',
  REJECTED: 'رد شده',
  CANCELLED: 'لغو شده',
  EXPIRED: 'منقضی شده',
};

/**
 * OFR-001 state machine, table-driven (the card's transition table). Read as:
 * `OFFER_TRANSITIONS[from]` is the list of LEGAL target statuses; a status
 * missing from the list (or an empty list) means an illegal move.
 *
 * | from \ to   | PENDING | COUNTERED | ACCEPTED | REJECTED | CANCELLED | EXPIRED |
 * |-------------|---------|-----------|----------|----------|-----------|---------|
 * | PENDING     | —       | ✓         | ✓        | ✓        | ✓         | ✓       |
 * | COUNTERED   | —       | —         | —        | —        | —         | —       |
 * | ACCEPTED    | —       | —         | —        | —        | —         | —       |
 * | REJECTED    | —       | —         | —        | —        | —         | —       |
 * | CANCELLED   | —       | —         | —        | —        | —         | —       |
 * | EXPIRED     | —       | —         | —        | —        | —         | —       |
 *
 * Semantics (card):
 * - PENDING is the only live state; EVERY decision is terminal (an offer is
 *   never re-opened — renegotiation creates a COUNTER child offer instead).
 * - COUNTERED is not one row changing value: the countered row flips here AND
 *   a NEW PENDING child offer (parentId → this row) is created — see
 *   OffersService.createCounter.
 * - EXPIRED is normally stamped by the OFR-003 hourly sweep (PENDING past
 *   expiresAt); the transition stays in the table so the sweep and any
 *   accept-time expiry guard (OFR-002) share one rule set.
 * - Side effects per decision (service-owned): every legal move stamps
 *   `decidedAt` (all originate from PENDING); accept additionally invalidates
 *   sibling PENDING offers of the same buyer on the same lot (invalidateSiblings).
 *
 * Tested table-driven over EVERY (from, to) pair — 6 × 6 (offers.constants.spec).
 */
export const OFFER_TRANSITIONS: Record<OfferStatus, readonly OfferStatus[]> = {
  PENDING: [
    OfferStatus.COUNTERED,
    OfferStatus.ACCEPTED,
    OfferStatus.REJECTED,
    OfferStatus.CANCELLED,
    OfferStatus.EXPIRED,
  ],
  COUNTERED: [],
  ACCEPTED: [],
  REJECTED: [],
  CANCELLED: [],
  EXPIRED: [],
};

/**
 * Pure transition predicate — true iff `from → to` is a legal move per the
 * table above. Self-transitions are always illegal (a decision that changes
 * nothing is not a decision).
 */
export function canTransition(from: OfferStatus, to: OfferStatus): boolean {
  return OFFER_TRANSITIONS[from].includes(to);
}

/**
 * Pure transition assert — throws 409 OFFER_ERROR_CODES.ILLEGAL_TRANSITION for
 * any illegal (from, to) pair. Every status write in OffersService goes
 * through this so no code path can bypass the table.
 */
export function assertTransition(from: OfferStatus, to: OfferStatus): void {
  if (!canTransition(from, to)) {
    throw new ConflictException({
      code: OFFER_ERROR_CODES.ILLEGAL_TRANSITION,
      message: `Cannot move an offer from ${from} to ${to}`,
    });
  }
}

/**
 * Create-validation bounds (OFR-001, card "Validation"). DTOs do not exist yet
 * (OFR-002 owns endpoints); OffersService.validateOfferInput re-asserts these
 * so every write path (create + counter) shares one source.
 */

/** Toman bounds for the negotiated `unitPrice` (plan §3/§12 money ceiling). */
export const OFFER_MIN_UNIT_PRICE = 1;
export const OFFER_MAX_UNIT_PRICE = 2_000_000_000;
/**
 * The derived `totalPrice` (unitPrice × quantity) shares the money ceiling —
 * without this cap a big quantity under a legal unit price could overflow the
 * Postgres INTEGER column. Quantity itself is bounded by the lot
 * (minOrder..availableQuantity at offer time).
 */
export const OFFER_MAX_TOTAL_PRICE = 2_000_000_000;
/** Free-text note cap (card: "note ≤ 500"), counted in code points. */
export const OFFER_NOTE_MAX_LENGTH = 500;
/**
 * Offer expiry window (card: "expiry default 72 h") — stamped at create AND
 * at every counter (the child gets its own fresh 72 h, card OFR-002:
 * "counter: creates child offer by seller w/ own 72 h expiry").
 */
export const OFFER_EXPIRY_DAYS = 3;
/**
 * Cycle guard for OffersRepository.findChain: chains are short in practice
 * (bounded by negotiation patience), but the walk must be total even against
 * a corrupt parent loop — past this depth the partial chain is returned.
 */
export const OFFER_MAX_CHAIN_DEPTH = 32;

/** Machine-readable error codes carried on 4xx bodies (OFR-002 surfaces them). */
export const OFFER_ERROR_CODES = {
  /** A status write whose (from, to) pair has no OFFER_TRANSITIONS entry. */
  ILLEGAL_TRANSITION: 'ILLEGAL_TRANSITION',
  /** Offers are only made (and countered) on ACTIVE lots (card: "only on
   * ACTIVE lots" — OFR-002 restates it; the pure validator owns the rule). */
  LOT_NOT_ACTIVE: 'LOT_NOT_ACTIVE',
  /** unitPrice outside 1..2B, non-integer, or a derived totalPrice past the
   * money ceiling. */
  PRICE_OUT_OF_RANGE: 'PRICE_OUT_OF_RANGE',
  /** quantity outside lot.minOrderQuantity..lot.availableQuantity at offer
   * time (card: "quantity within minOrder..availableQuantity at offer time";
   * OFR-002 revalidates at accept → 409). */
  QUANTITY_OUT_OF_RANGE: 'QUANTITY_OUT_OF_RANGE',
  /** note longer than OFFER_NOTE_MAX_LENGTH code points. */
  NOTE_TOO_LONG: 'NOTE_TOO_LONG',
} as const;
