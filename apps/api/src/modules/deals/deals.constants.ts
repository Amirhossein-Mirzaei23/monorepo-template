import { ConflictException, ForbiddenException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
// DealStatus/DeliveryMethod/PaymentMethodRecorded are used as VALUES below
// (transition-table targets), unlike the label maps which only type them.
import { DealStatus, DeliveryMethod, PaymentMethodRecorded } from '@prisma/client';

/**
 * The hat that performs a transition (DEAL-001 matrix: B = the deal's buyer,
 * S = the deal's seller, A = an admin). Deliberately NOT the Prisma
 * AccountRole/UserRole enums — buyer/seller are the deal's two participants
 * (matched against Deal.buyerId/sellerId, dual-hat accounts included), while
 * ADMIN is the user's UserRole (DEAL-007's resolver). A plain string union
 * keeps the table independent of how the caller resolved the hat.
 */
export const DEAL_ROLES = ['BUYER', 'SELLER', 'ADMIN'] as const;

export type DealRole = (typeof DEAL_ROLES)[number];

/**
 * Persian display labels for the Deal enums (plan §3) — the single source the
 * web app renders through generated API types; never hardcode fa strings in
 * components. Keys are exhaustive per enum (Record<Enum, string> keeps the
 * map compile-time synced with the Prisma enum).
 */
export const DEAL_STATUS_LABELS_FA: Record<DealStatus, string> = {
  NEGOTIATING: 'در مذاکره',
  AGREED: 'توافق شده',
  PAYMENT_PENDING: 'در انتظار پرداخت',
  PAID: 'پرداخت شده',
  PREPARING: 'در حال آماده‌سازی',
  SHIPPED: 'ارسال شده',
  DELIVERED: 'تحویل شده',
  COMPLETED: 'تکمیل شده',
  CANCELLED: 'لغو شده',
  DISPUTED: 'در اختلاف',
};

export const DELIVERY_METHOD_LABELS_FA: Record<DeliveryMethod, string> = {
  PICKUP: 'تحویل حضوری',
  SELLER_SHIPS: 'ارسال توسط فروشنده',
  BUYER_TRANSPORT: 'حمل توسط خریدار',
  CARRIER: 'باربری',
};

export const PAYMENT_METHOD_LABELS_FA: Record<PaymentMethodRecorded, string> = {
  CASH: 'نقدی',
  CARD_TO_CARD: 'کارت به کارت',
  BANK_TRANSFER: 'انتقال بانکی',
  CHEQUE: 'چک',
};

/** One row of the state machine: a legal target, WHO may move there, and
 * whether the move needs a reason note. */
export interface DealTransitionRule {
  /** The legal target status. */
  to: DealStatus;
  /** The hats allowed to perform the move (checked against the deal's
   * buyer/seller ids, or UserRole.ADMIN). */
  roles: readonly DealRole[];
  /** True when the move requires a non-empty note — CANCELLED (the reason
   * lands in cancelReason) and DISPUTED (disputeReason). Enforced by
   * DealsService.transition (the pure assertTransition below cannot see the
   * note, only the gate can). */
  requiresReason: boolean;
}

/**
 * DEAL-001 state machine, table-driven (the card's transition matrix).
 * Read as: `DEAL_TRANSITIONS[from]` lists every LEGAL target with its
 * role permissions; a (from, to) pair missing from the list is an illegal
 * move, a pair whose `roles` exclude the caller's hat is a role denial.
 *
 * | from \ to       | NEG | AGR | PAY | PAID | PRE | SHP | DLV | COM | CAN | DIS |
 * |-----------------|-----|-----|-----|------|-----|-----|-----|-----|-----|-----|
 * | NEGOTIATING     | —   | B,S | —   | —    | —   | —   | —   | —   | B,S | B,S |
 * | AGREED          | —   | —   | B,S | —    | —   | —   | —   | —   | B,S | B,S |
 * | PAYMENT_PENDING | —   | —   | —   | S    | —   | —   | —   | —   | S   | B,S |
 * | PAID            | —   | —   | —   | —    | S   | —   | —   | —   | —   | B,S |
 * | PREPARING       | —   | —   | —   | —    | —   | S   | —   | —   | —   | B,S |
 * | SHIPPED         | —   | —   | —   | —    | —   | —   | S   | —   | —   | B,S |
 * | DELIVERED       | —   | —   | —   | —    | —   | —   | —   | B   | —   | B,S |
 * | COMPLETED       | —   | —   | —   | —    | —   | —   | —   | —   | —   | —   |
 * | CANCELLED       | —   | —   | —   | —    | —   | —   | —   | —   | —   | —   |
 * | DISPUTED        | —   | —   | —   | —    | —   | —   | —   | A   | A   | —   |
 *
 * Semantics (card):
 * - NEGOTIATING→AGREED is "B|S, during deal edit window" — the WINDOW is a
 *   timing rule for DEAL-002/003's endpoints, not a status rule; the table
 *   owns only the (from, to, roles) shape.
 * - PAYMENT_PENDING→PAID is the SELLER's confirm ONLY. The buyer's «پرداخت
 *   کردم» is NOT a transition: it stamps `paidConfirmedByBuyerAt` + appends
 *   an informational DealEvent (fromStatus = toStatus = PAYMENT_PENDING) —
 *   the DEAL-006 payment-confirm endpoint owns that write; the seller's
 *   confirm (this row) does the status move.
 * - PAYMENT_PENDING→CANCELLED is S-only: once payment is pending the buyer
 *   has a live payment in flight — cancelling is the receiving side's call.
 * - Every non-terminal status may → DISPUTED (B|S, w/ reason) — disputes are
 *   the participant escape hatch up to (but excluding) the terminal states.
 * - Terminal: COMPLETED and CANCELLED freeze entirely. DISPUTED freezes for
 *   participants; ADMIN's resolution rows (→COMPLETED | →CANCELLED) are in
 *   the table NOW per the matrix so DEAL-007 (P1) only adds endpoints — the
 *   machine already knows the moves.
 * - AUTO-COMPLETE HOOK (NOT this card): DELIVERED→COMPLETED auto-flips after
 *   7 days. That is a jobs-module sweep (like OFR-003/LOT-006) calling the
 *   SAME table with role BUYER semantics or an actorless system event
 *   (DealEvent.actorId = null, already modeled). Add the sweep there — do
 *   not widen this table for it.
 * - Stage stamps: every legal move also stamps the target stage's timestamp
 *   (STAGE_TIMESTAMP_FIELDS below) in the same write.
 *
 * Tested table-driven over EVERY (from, to, role) cell — 10 × 10 × 3 =
 * 300 (deals.constants.spec, against an independent restatement of this
 * table).
 */
export const DEAL_TRANSITIONS: Record<DealStatus, readonly DealTransitionRule[]> = {
  NEGOTIATING: [
    { to: DealStatus.AGREED, roles: ['BUYER', 'SELLER'], requiresReason: false },
    { to: DealStatus.CANCELLED, roles: ['BUYER', 'SELLER'], requiresReason: true },
    { to: DealStatus.DISPUTED, roles: ['BUYER', 'SELLER'], requiresReason: true },
  ],
  AGREED: [
    { to: DealStatus.PAYMENT_PENDING, roles: ['BUYER', 'SELLER'], requiresReason: false },
    { to: DealStatus.CANCELLED, roles: ['BUYER', 'SELLER'], requiresReason: true },
    { to: DealStatus.DISPUTED, roles: ['BUYER', 'SELLER'], requiresReason: true },
  ],
  PAYMENT_PENDING: [
    { to: DealStatus.PAID, roles: ['SELLER'], requiresReason: false },
    { to: DealStatus.CANCELLED, roles: ['SELLER'], requiresReason: true },
    { to: DealStatus.DISPUTED, roles: ['BUYER', 'SELLER'], requiresReason: true },
  ],
  PAID: [
    { to: DealStatus.PREPARING, roles: ['SELLER'], requiresReason: false },
    { to: DealStatus.DISPUTED, roles: ['BUYER', 'SELLER'], requiresReason: true },
  ],
  PREPARING: [
    { to: DealStatus.SHIPPED, roles: ['SELLER'], requiresReason: false },
    { to: DealStatus.DISPUTED, roles: ['BUYER', 'SELLER'], requiresReason: true },
  ],
  SHIPPED: [
    { to: DealStatus.DELIVERED, roles: ['SELLER'], requiresReason: false },
    { to: DealStatus.DISPUTED, roles: ['BUYER', 'SELLER'], requiresReason: true },
  ],
  DELIVERED: [
    { to: DealStatus.COMPLETED, roles: ['BUYER'], requiresReason: false },
    { to: DealStatus.DISPUTED, roles: ['BUYER', 'SELLER'], requiresReason: true },
  ],
  COMPLETED: [],
  CANCELLED: [],
  DISPUTED: [
    { to: DealStatus.COMPLETED, roles: ['ADMIN'], requiresReason: false },
    { to: DealStatus.CANCELLED, roles: ['ADMIN'], requiresReason: true },
  ],
};

/** The rule for a (from, to) pair, or undefined when the move is illegal. */
export function transitionRuleFor(
  from: DealStatus,
  to: DealStatus,
): DealTransitionRule | undefined {
  return DEAL_TRANSITIONS[from].find((rule) => rule.to === to);
}

/**
 * Pure transition predicate — true iff `from → to` is a legal move AND
 * `role` is one of the hats allowed to perform it. Self-transitions are
 * always illegal (a decision that changes nothing is not a decision).
 */
export function canTransition(from: DealStatus, to: DealStatus, role: DealRole): boolean {
  const rule = transitionRuleFor(from, to);
  return rule !== undefined && rule.roles.includes(role);
}

/**
 * Pure transition assert — the ONE gate every status write in the deals
 * module goes through (no code path may bypass the table). Distinguishes the
 * two failure shapes DEAL-003's API surfaces:
 * - unknown (from, to) pair → 409 ILLEGAL_TRANSITION (the move does not exist)
 * - known pair, wrong hat   → 403 TRANSITION_ROLE_FORBIDDEN (the move exists,
 *   the caller may not perform it)
 */
export function assertTransition(from: DealStatus, to: DealStatus, role: DealRole): void {
  const rule = transitionRuleFor(from, to);
  if (rule === undefined) {
    throw new ConflictException({
      code: DEAL_ERROR_CODES.ILLEGAL_TRANSITION,
      message: `Cannot move a deal from ${from} to ${to}`,
    });
  }
  if (!rule.roles.includes(role)) {
    throw new ForbiddenException({
      code: DEAL_ERROR_CODES.TRANSITION_ROLE_FORBIDDEN,
      message: `${role} cannot move a deal from ${from} to ${to}`,
    });
  }
}

/**
 * The stage-timestamp column each TARGET status stamps on transition
 * (plan §3 "timestamps per stage"): `agreedAt`, `paymentPendingAt`, `paidAt`,
 * `preparingAt`, `shippedAt`, `deliveredAt`, `completedAt`. NEGOTIATING is
 * the creation state (createdAt covers it) and CANCELLED/DISPUTED have no
 * stage of their own (their reason columns carry the record) — those map to
 * null. DealsService.transition reads this map so a status write and its
 * stage stamp can never drift apart.
 */
export const STAGE_TIMESTAMP_FIELDS: Record<DealStatus, DealStageTimestampField | null> = {
  NEGOTIATING: null,
  AGREED: 'agreedAt',
  PAYMENT_PENDING: 'paymentPendingAt',
  PAID: 'paidAt',
  PREPARING: 'preparingAt',
  SHIPPED: 'shippedAt',
  DELIVERED: 'deliveredAt',
  COMPLETED: 'completedAt',
  CANCELLED: null,
  DISPUTED: null,
};

/** The nullable stage-stamp columns on Deal (a keyof pick keeps the map
 * compile-time synced with the model). */
export type DealStageTimestampField =
  | 'agreedAt'
  | 'paymentPendingAt'
  | 'paidAt'
  | 'preparingAt'
  | 'shippedAt'
  | 'deliveredAt'
  | 'completedAt';

/**
 * The reason column a reason-requiring move writes (requiresReason rows):
 * →CANCELLED writes cancelReason, →DISPUTED writes disputeReason.
 */
export const REASON_FIELDS: Record<DealStatus, DealReasonField | null> = {
  NEGOTIATING: null,
  AGREED: null,
  PAYMENT_PENDING: null,
  PAID: null,
  PREPARING: null,
  SHIPPED: null,
  DELIVERED: null,
  COMPLETED: null,
  CANCELLED: 'cancelReason',
  DISPUTED: 'disputeReason',
};

/** The nullable reason columns on Deal. */
export type DealReasonField = 'cancelReason' | 'disputeReason';

/**
 * RESERVED commission rate, in basis points (percent × 100 — 250 = 2.5%;
 * Int keeps the money math integer-safe). 0% for the MVP (card: "configurable
 * const (0% MVP, field reserved)"); DEAL-006 turns the dial and populates
 * commissionAmount = floor(totalPrice × rate / 10_000). Until then the field
 * is written as this constant and the amount stays null.
 */
export const DEAL_COMMISSION_RATE_BASIS_POINTS = 0;

/**
 * Create-validation bounds (DEAL-001, card "Validation"). DTOs do not exist
 * yet (DEAL-002 owns endpoints); DealsService.validateDealInput asserts these
 * so every write path shares one source — the same convention as the offers
 * module (mirrored bounds on purpose: a deal's money IS a negotiated offer's
 * money).
 */

/** Toman bounds for the agreed `unitPrice` (plan §3/§12 money ceiling). */
export const DEAL_MIN_UNIT_PRICE = 1;
export const DEAL_MAX_UNIT_PRICE = 2_000_000_000;
/**
 * The derived `totalPrice` (unitPrice × quantity) shares the money ceiling —
 * without this cap a legal unit price over a big quantity would overflow the
 * Postgres INTEGER column.
 */
export const DEAL_MAX_TOTAL_PRICE = 2_000_000_000;
/** Free-text cap for deliveryNote / paymentTermsNote / event notes (the
 * offers note cap, mirrored), counted in code points. */
export const DEAL_NOTE_MAX_LENGTH = 500;

/** Machine-readable error codes carried on 4xx bodies (DEAL-002/003 surface
 * them; the web renders fa copy keyed off these strings). */
export const DEAL_ERROR_CODES = {
  /** A status write whose (from, to) pair has no DEAL_TRANSITIONS entry
   * (409) — includes self-transitions and moves out of terminal states. */
  ILLEGAL_TRANSITION: 'ILLEGAL_TRANSITION',
  /** A legal (from, to) pair attempted by a hat the row's `roles` exclude
   * (403) — DEAL-003's "403 wrong role". */
  TRANSITION_ROLE_FORBIDDEN: 'TRANSITION_ROLE_FORBIDDEN',
  /** A requiresReason move (→CANCELLED, →DISPUTED) with an empty/whitespace
   * note (400) — the note length rule lives with the DEAL-003 DTOs. */
  REASON_REQUIRED: 'REASON_REQUIRED',
  /** unitPrice outside 1..2B, non-integer, or a derived totalPrice past the
   * money ceiling (400). */
  PRICE_OUT_OF_RANGE: 'PRICE_OUT_OF_RANGE',
  /** quantity non-integer, < 1, or > lot.availableQuantity at creation (409)
   * — the card's "qty ≤ lot.available at creation" invariant. */
  QUANTITY_OUT_OF_RANGE: 'QUANTITY_OUT_OF_RANGE',
  /** deliveryNote / paymentTermsNote longer than DEAL_NOTE_MAX_LENGTH code
   * points (400). */
  NOTE_TOO_LONG: 'NOTE_TOO_LONG',
  /** validateDealInput was handed an offer that belongs to a DIFFERENT lot
   * (400) — a caller wiring bug, not a probeable resource (the
   * CONVERSATION_LOT_MISMATCH precedent). Offer ACCEPTED-status/buyer checks
   * are DEAL-002's runtime concerns, not this pure validator's. */
  OFFER_LOT_MISMATCH: 'OFFER_LOT_MISMATCH',
} as const;

/**
 * `code` is the public URL id of a deal (plan §3): 8 base62 chars from
 * crypto.randomBytes — non-sequential so internal cuids stay private.
 * Hand-rolled (no nanoid dependency), the same scheme as generateLotCode
 * (the space, 62^8 ≈ 2.2e14, makes collisions unlikely); unique-violation
 * retries are a service-layer concern (DEAL-002 create path). Kept local to
 * the deals module rather than imported from lots: deal codes may evolve
 * independently (e.g. a prefixed format) without touching lot codes.
 */
const DEAL_CODE_LENGTH = 8;
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
// 4 * 62 = 248: randomBytes values ≥ 248 would bias `byte % 62` toward the
// first 8 alphabet entries, so they are discarded (rejection sampling).
const BASE62_REJECT_THRESHOLD = 248;

export function generateDealCode(): string {
  let code = '';
  while (code.length < DEAL_CODE_LENGTH) {
    for (const byte of randomBytes(DEAL_CODE_LENGTH)) {
      if (byte >= BASE62_REJECT_THRESHOLD) {
        continue;
      }
      code += BASE62[byte % BASE62.length];
      if (code.length === DEAL_CODE_LENGTH) {
        return code;
      }
    }
  }
  return code;
}
