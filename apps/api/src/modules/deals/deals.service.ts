import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import {
  DealStatus,
  DeliveryMethod,
  PaymentMethodRecorded,
  type Deal,
  type DealEvent,
  type Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DealsRepository } from './deals.repository';
import {
  DEAL_COMMISSION_RATE_BASIS_POINTS,
  DEAL_ERROR_CODES,
  DEAL_MAX_TOTAL_PRICE,
  DEAL_MAX_UNIT_PRICE,
  DEAL_MIN_UNIT_PRICE,
  DEAL_NOTE_MAX_LENGTH,
  REASON_FIELDS,
  STAGE_TIMESTAMP_FIELDS,
  assertTransition,
  transitionRuleFor,
  type DealReasonField,
  type DealRole,
  type DealStageTimestampField,
} from './deals.constants';

type Tx = Prisma.TransactionClient | undefined;

/** The deal-terms payload a creator supplies (DEAL-002's POST /deals body
 * shape); identity/context (lot, buyer, seller, offer, conversation) come
 * from the loaded rows, never from this payload. */
export interface DealTermsInput {
  /** Dealt piece count — validated against the lot (≤ availableQuantity). */
  quantity: number;
  /** Agreed per-unit Toman price — 1..2B (the input; total is derived). */
  unitPrice: number;
  deliveryMethod: DeliveryMethod;
  paymentMethod: PaymentMethodRecorded;
  /** Optional free-text delivery arrangement, ≤ 500 code points; trimmed,
   * empty → null. */
  deliveryNote?: string | null;
  /** Optional free-text payment terms, ≤ 500 code points; trimmed, empty →
   * null. */
  paymentTermsNote?: string | null;
}

/** What validateDealInput produces for the create write (plan §3 row, derived
 * fields set). Everything is a COPY — the snapshot semantics: later lot/offer
 * edits never mutate a deal, because only these values are ever written. */
export interface ValidatedDealTerms {
  quantity: number;
  unitPrice: number;
  /** Derived on write: unitPrice × quantity (never client-supplied). */
  totalPrice: number;
  deliveryMethod: DeliveryMethod;
  deliveryNote: string | null;
  paymentMethod: PaymentMethodRecorded;
  paymentTermsNote: string | null;
  /** Reserved field — written as the module constant (0 MVP). */
  commissionRate: number;
}

/** The slice of the lot the deal rules read (the LotsRepository row satisfies
 * it). Status/ACTIVE checks are DEAL-002's runtime concerns (re-validation at
 * the endpoint), not this pure validator's. */
export interface DealableLot {
  id: string;
  availableQuantity: number;
}

/** The slice of the offer validateDealInput cross-checks (provenance wiring
 * only — ACCEPTED-status/buyer checks are DEAL-002's). */
export interface DealableOffer {
  id: string;
  lotId: string;
}

/** Visible-character length: counts Unicode CODE POINTS, not UTF-16 units —
 * the fa-aware note rule (mirrors the offers/lots title rule). */
function codePointLength(value: string): number {
  return [...value].length;
}

/** Trim → empty-string-becomes-null (no empty-string note rows anywhere in
 * the app). Length is enforced separately (assertNoteCap). */
export function normalizeDealNote(value: string | null | undefined): string | null {
  const trimmed = (value ?? null)?.trim() ?? null;
  return trimmed !== null && trimmed.length === 0 ? null : trimmed;
}

/** 400 NOTE_TOO_LONG past the cap (shared by the terms notes and the
 * transition reason/event note). */
function assertNoteCap(note: string): void {
  if (codePointLength(note) > DEAL_NOTE_MAX_LENGTH) {
    throw new BadRequestException({
      code: DEAL_ERROR_CODES.NOTE_TOO_LONG,
      message: `note must be at most ${DEAL_NOTE_MAX_LENGTH} characters`,
    });
  }
}

/**
 * PURE create-validation (DEAL-001 card "Validation") — the ONE rule set
 * every deal-creation path shares (DEAL-002's offer path AND chat quick
 * path). Checks, in order:
 *
 * 1. PRICE (400 PRICE_OUT_OF_RANGE): integer unitPrice within 1..2B Toman;
 *    plus the DERIVED totalPrice = unitPrice × quantity must stay within the
 *    same money ceiling (the Postgres INTEGER guard — identical to offers).
 * 2. NOTES (400 NOTE_TOO_LONG): deliveryNote / paymentTermsNote ≤ 500 code
 *    points after trim; empty-after-trim is stored as null.
 * 3. OFFER WIRING (400 OFFER_LOT_MISMATCH): when an offer is given as
 *    provenance it must belong to the SAME lot — a cross-lot link is a
 *    caller bug, not a probeable resource. Whether the offer is ACCEPTED and
 *    belongs to the caller is DEAL-002's runtime check (it needs the live
 *    row); this validator stays pure.
 * 4. QUANTITY (409 QUANTITY_OUT_OF_RANGE): integer ≥ 1 and ≤
 *    lot.availableQuantity AT CREATION — the card's "qty ≤ lot.available"
 *    invariant. Note the difference from offers on purpose: a deal has no
 *    minOrderQuantity floor (parties may agree on fewer pieces in
 *    negotiation); the lot's availability ceiling is the hard bound.
 *
 * deliveryMethod/paymentMethod are typed enums — invalid values cannot be
 * constructed type-safely and the DTO layer (DEAL-002) guards the wire.
 *
 * Pure given `now` (accepted for signature symmetry with the offers
 * validator; the deal has no expiry — nothing derives from it today). Never
 * reads or writes — the caller supplies the rows it already loaded.
 */
export function validateDealInput(
  input: DealTermsInput,
  lot: DealableLot,
  offer?: DealableOffer,
): ValidatedDealTerms {
  const { quantity, unitPrice } = input;
  if (
    !Number.isInteger(unitPrice) ||
    unitPrice < DEAL_MIN_UNIT_PRICE ||
    unitPrice > DEAL_MAX_UNIT_PRICE
  ) {
    throw new BadRequestException({
      code: DEAL_ERROR_CODES.PRICE_OUT_OF_RANGE,
      message: `unitPrice must be a whole Toman amount between ${DEAL_MIN_UNIT_PRICE} and ${DEAL_MAX_UNIT_PRICE}`,
    });
  }
  // Both factors are ≥ 1 by the guards below/above, so totalPrice ≥ 1 holds;
  // only the ceiling needs checking here.
  const totalPrice = unitPrice * quantity;
  if (totalPrice > DEAL_MAX_TOTAL_PRICE) {
    throw new BadRequestException({
      code: DEAL_ERROR_CODES.PRICE_OUT_OF_RANGE,
      message: `totalPrice (unitPrice × quantity) must not exceed ${DEAL_MAX_TOTAL_PRICE} Toman`,
    });
  }

  const deliveryNote = normalizeDealNote(input.deliveryNote);
  if (deliveryNote !== null) {
    assertNoteCap(deliveryNote);
  }
  const paymentTermsNote = normalizeDealNote(input.paymentTermsNote);
  if (paymentTermsNote !== null) {
    assertNoteCap(paymentTermsNote);
  }

  if (offer !== undefined && offer.lotId !== lot.id) {
    throw new BadRequestException({
      code: DEAL_ERROR_CODES.OFFER_LOT_MISMATCH,
      message: 'The offer belongs to a different lot',
    });
  }

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > lot.availableQuantity) {
    throw new ConflictException({
      code: DEAL_ERROR_CODES.QUANTITY_OUT_OF_RANGE,
      message: `quantity must be between 1 and ${lot.availableQuantity}`,
    });
  }

  return {
    quantity,
    unitPrice,
    totalPrice,
    deliveryMethod: input.deliveryMethod,
    deliveryNote,
    paymentMethod: input.paymentMethod,
    paymentTermsNote,
    commissionRate: DEAL_COMMISSION_RATE_BASIS_POINTS,
  };
}

/**
 * The creation timeline entry (fromStatus = toStatus = NEGOTIATING) —
 * DealsRepository.create pairs it with the deal row so the timeline is total
 * from birth (the dealId is stamped by the repository from the created row).
 * The fa «معامله ایجاد شد #CODE» note is DEAL-002's copy to pass in; actorId
 * stays null when the creator is system/tooling.
 */
export function creationEvent(
  args: { actorId?: string | null; note?: string | null } = {},
): Omit<Prisma.DealEventUncheckedCreateInput, 'dealId'> {
  return {
    actorId: args.actorId ?? null,
    fromStatus: DealStatus.NEGOTIATING,
    toStatus: DealStatus.NEGOTIATING,
    note: normalizeDealNote(args.note),
  };
}

/**
 * Deal business rules — DEAL-001's domain half (the matrix executor, stage
 * stamps, timeline) with NO endpoints (DEAL-002/003 own those; this service
 * is the layer they call).
 *
 * Documented decisions carried from the card:
 * - The buyer's «پرداخت کردم» is NOT a transition: DEAL-006's payment-confirm
 *   endpoint stamps `paidConfirmedByBuyerAt` + appends an informational
 *   DealEvent (fromStatus = toStatus = PAYMENT_PENDING, note «خریدار پرداخت
 *   را اعلام کرد») and notifies the seller; only the SELLER's confirm moves
 *   PAYMENT_PENDING → PAID (the matrix row). Hook point — DEAL-006.
 * - DELIVERED→COMPLETED auto-confirms after 7 days. That is a jobs-module
 *   sweep (the OFR-003/LOT-006 pattern) — NOT this card. The sweep must go
 *   through THIS transition method (system event: actorId null, role BUYER's
 *   DELIVERED→COMPLETED row); do not widen the table for it.
 */
@Injectable()
export class DealsService {
  constructor(
    private readonly repository: DealsRepository,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * The single status-write gate + executor: asserts the move against
   * DEAL_TRANSITIONS (409 ILLEGAL_TRANSITION for an unknown (from, to) pair,
   * 403 TRANSITION_ROLE_FORBIDDEN for a role denial), requires the note on
   * reason-requiring rows (400 REASON_REQUIRED — every →CANCELLED and
   * →DISPUTED), then writes status + the target stage's timestamp (+ the
   * cancelReason/disputeReason column) AND the DealEvent in ONE transaction
   * (join the caller's via `tx`; without one the helper opens its own). The
   * event note carries the trimmed reason, so the timeline alone tells the
   * whole story (principle 13).
   */
  async transition(
    deal: Deal,
    to: DealStatus,
    role: DealRole,
    options: { actorId?: string | null; note?: string | null } = {},
    now: Date = new Date(),
    tx: Tx = undefined,
  ): Promise<Deal> {
    const rule = transitionRuleFor(deal.status, to);
    assertTransition(deal.status, to, role);

    const note = normalizeDealNote(options.note);
    if (rule?.requiresReason === true && note === null) {
      throw new BadRequestException({
        code: DEAL_ERROR_CODES.REASON_REQUIRED,
        message: `Moving a deal to ${to} requires a reason note`,
      });
    }
    if (note !== null) {
      assertNoteCap(note);
    }

    const data: Prisma.DealUncheckedUpdateInput = { status: to };
    const stageField: DealStageTimestampField | null = STAGE_TIMESTAMP_FIELDS[to];
    switch (stageField) {
      case 'agreedAt':
        data.agreedAt = now;
        break;
      case 'paymentPendingAt':
        data.paymentPendingAt = now;
        break;
      case 'paidAt':
        data.paidAt = now;
        break;
      case 'preparingAt':
        data.preparingAt = now;
        break;
      case 'shippedAt':
        data.shippedAt = now;
        break;
      case 'deliveredAt':
        data.deliveredAt = now;
        break;
      case 'completedAt':
        data.completedAt = now;
        break;
      default:
        break; // NEGOTIATING / CANCELLED / DISPUTED — no stage stamp (constants doc)
    }
    const reasonField: DealReasonField | null = REASON_FIELDS[to];
    if (reasonField === 'cancelReason') {
      data.cancelReason = note;
    } else if (reasonField === 'disputeReason') {
      data.disputeReason = note;
    }

    const run = async (client: Tx): Promise<Deal> => {
      const updated = await this.repository.update(deal.id, data, client);
      await this.repository.appendEvent(
        {
          dealId: deal.id,
          actorId: options.actorId ?? null,
          fromStatus: deal.status,
          toStatus: to,
          note,
          // The event happens AT the transition — same clock value as the
          // deal's stage stamp, so the timeline and the stamps agree (and
          // tests can drive deterministic timelines with an injected now).
          createdAt: now,
        },
        client,
      );
      return updated;
    };
    return tx !== undefined ? run(tx) : this.prisma.$transaction(async (client) => run(client));
  }

  /**
   * The audit timeline of one deal, oldest first — passthrough to the
   * repository (DEAL-004 renders it; DEAL-007's investigation view too).
   */
  async timeline(dealId: string, tx: Tx = undefined): Promise<DealEvent[]> {
    return this.repository.findEvents(dealId, tx);
  }
}
