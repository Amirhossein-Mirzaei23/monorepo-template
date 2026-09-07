import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LotStatus, OfferStatus, type Lot, type Offer, type Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LotsRepository } from '../lots/lots.repository';
import { OffersRepository } from './offers.repository';
import {
  OFFER_ERROR_CODES,
  OFFER_EXPIRY_DAYS,
  OFFER_MAX_TOTAL_PRICE,
  OFFER_MAX_UNIT_PRICE,
  OFFER_MIN_UNIT_PRICE,
  OFFER_NOTE_MAX_LENGTH,
  assertTransition,
} from './offers.constants';

type Tx = Prisma.TransactionClient | undefined;

/** Milliseconds in a day — the 72 h expiry window's unit. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** The buyer-controlled part of an offer (terms); identity/context come from
 * the lot + caller + optional conversation, never from this payload. */
export interface OfferTermsInput {
  /** Offered piece count — validated against the lot (minOrder..available). */
  quantity: number;
  /** Negotiated per-unit Toman price — 1..2B (the input; total is derived). */
  unitPrice: number;
  /** Optional free-text note, ≤ 500 code points; trimmed, empty → null. */
  note?: string | null;
}

/** What validateOfferInput produces for a write (plan §3 row, derived fields set). */
export interface ValidatedOfferTerms {
  quantity: number;
  unitPrice: number;
  /** Derived on write: unitPrice × quantity (never client-supplied). */
  totalPrice: number;
  note: string | null;
  /** Decision deadline: input `now` + OFFER_EXPIRY_DAYS (72 h). */
  expiresAt: Date;
}

/** The slice of the lot the offer rules read (the LotsRepository row satisfies it). */
export type OfferableLot = Pick<Lot, 'status' | 'minOrderQuantity' | 'availableQuantity'>;

/** Visible-character length: counts Unicode CODE POINTS, not UTF-16 units —
 * the fa-aware note rule (mirrors the lots title rule). */
function codePointLength(value: string): number {
  return [...value].length;
}

/**
 * PURE create-validation (OFR-001 card) — the ONE rule set both write paths
 * (root create in OFR-002, counter here) share. Checks, in order:
 *
 * 1. PRICE (400 PRICE_OUT_OF_RANGE): integer unitPrice within
 *    1..2,000,000,000 Toman; plus the DERIVED totalPrice = unitPrice ×
 *    quantity must stay within the same money ceiling — without it a legal
 *    unit price over a big quantity would overflow the Postgres INTEGER
 *    column (backend.md: money is Toman Int ≤ 2,000,000,000).
 * 2. NOTE (400 NOTE_TOO_LONG): ≤ 500 code points after trim; a note that is
 *    empty after trim is stored as null (no empty-string rows).
 * 3. LOT STATE (409 LOT_NOT_ACTIVE): offers exist only on ACTIVE lots — the
 *    card's "only on ACTIVE lots"; a paused/expired/sold lot cannot receive
 *    or counter offers.
 * 4. QUANTITY (409 QUANTITY_OUT_OF_RANGE): integer within
 *    lot.minOrderQuantity..lot.availableQuantity AT OFFER TIME (the snapshot
 *    rule; OFR-002 re-checks availability at accept and 409s on drift).
 *
 * Pure given `now` (defaults to the current time for expiresAt). Never reads
 * or writes — the caller supplies the lot row it already loaded.
 */
export function validateOfferInput(
  input: OfferTermsInput,
  lot: OfferableLot,
  now: Date = new Date(),
): ValidatedOfferTerms {
  const { quantity, unitPrice } = input;
  if (
    !Number.isInteger(unitPrice) ||
    unitPrice < OFFER_MIN_UNIT_PRICE ||
    unitPrice > OFFER_MAX_UNIT_PRICE
  ) {
    throw new BadRequestException({
      code: OFFER_ERROR_CODES.PRICE_OUT_OF_RANGE,
      message: `unitPrice must be a whole Toman amount between ${OFFER_MIN_UNIT_PRICE} and ${OFFER_MAX_UNIT_PRICE}`,
    });
  }
  // Both factors are ≥ 1 by the guards below/above, so totalPrice ≥ 1 holds;
  // only the ceiling needs checking here.
  const totalPrice = unitPrice * quantity;
  if (totalPrice > OFFER_MAX_TOTAL_PRICE) {
    throw new BadRequestException({
      code: OFFER_ERROR_CODES.PRICE_OUT_OF_RANGE,
      message: `totalPrice (unitPrice × quantity) must not exceed ${OFFER_MAX_TOTAL_PRICE} Toman`,
    });
  }

  const trimmedNote = (input.note ?? null)?.trim() ?? null;
  if (trimmedNote !== null && codePointLength(trimmedNote) > OFFER_NOTE_MAX_LENGTH) {
    throw new BadRequestException({
      code: OFFER_ERROR_CODES.NOTE_TOO_LONG,
      message: `note must be at most ${OFFER_NOTE_MAX_LENGTH} characters`,
    });
  }

  if (lot.status !== LotStatus.ACTIVE) {
    throw new ConflictException({
      code: OFFER_ERROR_CODES.LOT_NOT_ACTIVE,
      message: 'Offers can only be made on active lots',
    });
  }

  if (
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity < lot.minOrderQuantity ||
    quantity > lot.availableQuantity
  ) {
    throw new ConflictException({
      code: OFFER_ERROR_CODES.QUANTITY_OUT_OF_RANGE,
      message: `quantity must be between ${lot.minOrderQuantity} and ${lot.availableQuantity}`,
    });
  }

  return {
    quantity,
    unitPrice,
    totalPrice,
    note: trimmedNote !== null && trimmedNote.length === 0 ? null : trimmedNote,
    expiresAt: new Date(now.getTime() + OFFER_EXPIRY_DAYS * DAY_MS),
  };
}

/**
 * Offer business rules (OFR-001) — the domain half of the negotiation
 * feature: pure transition rules live in offers.constants.ts (table-driven,
 * tested over every (from, to) pair); this service owns the WRITES around
 * them:
 *
 * - `transition` — the single status-write gate (assert → update + decidedAt).
 * - `createCounter` — the chain helper: a counter NEVER mutates the countered
 *   offer's terms; it creates a NEW PENDING child offer (parentId → parent)
 *   inheriting lot/buyer/seller/conversation, then flips the parent to
 *   COUNTERED with decidedAt. One transaction; the child carries its own
 *   fresh 72 h expiry (the chain head is the deepest PENDING row).
 * - `invalidateSiblings` — the accept side (OFR-002): accepting one offer
 *   REJECTS the buyer's other PENDING offers on the same lot, so a buyer
 *   cannot hold several live commitments for one lot.
 *
 * NO controller exists at this stage (OFR-002 owns the endpoints); role
 * checks, conversation action-messages and notification hooks are that card's
 * work.
 */
@Injectable()
export class OffersService {
  constructor(
    private readonly repository: OffersRepository,
    private readonly lots: LotsRepository,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * The single status-write gate: asserts the move against OFFER_TRANSITIONS
   * (409 ILLEGAL_TRANSITION otherwise) and stamps `decidedAt` — every legal
   * move originates from PENDING, so the stamp always applies.
   */
  async transition(
    offer: Offer,
    to: OfferStatus,
    now: Date = new Date(),
    tx: Tx = undefined,
  ): Promise<Offer> {
    assertTransition(offer.status, to);
    return this.repository.update(offer.id, { status: to, decidedAt: now }, tx);
  }

  /**
   * Chain helper (card: "counters create a new linked offer"). `parent` must
   * be PENDING (assertTransition → 409 otherwise); the lot is re-read because
   * the child offer must satisfy the CURRENT lot rules — an ACTIVE lot is
   * required and minOrder/available may have moved since the parent was
   * written. Returns both rows: the flipped parent (COUNTERED + decidedAt)
   * and the new PENDING child.
   */
  async createCounter(
    parent: Offer,
    input: OfferTermsInput,
    now: Date = new Date(),
  ): Promise<{ parent: Offer; child: Offer }> {
    assertTransition(parent.status, OfferStatus.COUNTERED);

    const lot = await this.lots.findById(parent.lotId);
    if (!lot) {
      throw new NotFoundException('Lot not found');
    }
    const validated = validateOfferInput(input, lot, now);

    return this.prisma.$transaction(async (tx) => {
      // The child inherits the negotiation context (lot/buyer/seller/
      // conversation) and links back through parentId — the chain IS the
      // offer history.
      const child = await this.repository.create(
        {
          lotId: parent.lotId,
          buyerId: parent.buyerId,
          sellerId: parent.sellerId,
          conversationId: parent.conversationId,
          parentId: parent.id,
          quantity: validated.quantity,
          unitPrice: validated.unitPrice,
          totalPrice: validated.totalPrice,
          note: validated.note,
          status: OfferStatus.PENDING,
          expiresAt: validated.expiresAt,
        },
        tx,
      );
      const countered = await this.repository.update(
        parent.id,
        { status: OfferStatus.COUNTERED, decidedAt: now },
        tx,
      );
      return { parent: countered, child };
    });
  }

  /**
   * Accept-side helper (card: "accepting invalidates sibling pending offers on
   * the same lot from the same buyer"): flips every PENDING offer of `buyerId`
   * on `lotId` except `exceptOfferId` to REJECTED (decidedAt = now) inside the
   * caller's transaction. Returns how many siblings were rejected (0 when the
   * accepted offer was the buyer's only live one). OFR-002 composes this with
   * the accept write in one tx so a failure rolls the whole decision back.
   */
  async invalidateSiblings(
    lotId: string,
    buyerId: string,
    exceptOfferId: string,
    now: Date = new Date(),
    tx: Tx = undefined,
  ): Promise<number> {
    const siblings = await this.repository.findSiblingsPending(lotId, buyerId, exceptOfferId, tx);
    for (const sibling of siblings) {
      // The predicate already narrowed these to PENDING; the assert keeps the
      // write honest if the predicate ever widens (fail loudly, not wrongly).
      assertTransition(sibling.status, OfferStatus.REJECTED);
      await this.repository.update(
        sibling.id,
        { status: OfferStatus.REJECTED, decidedAt: now },
        tx,
      );
    }
    return siblings.length;
  }

  /**
   * Chain context read (card: "findChain … walk parents for context") —
   * passthrough to the repository; oldest first, requested offer last.
   */
  async findChain(offerId: string, tx: Tx = undefined): Promise<Offer[]> {
    return this.repository.findChain(offerId, tx);
  }
}
