import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AccountRole,
  DealStatus,
  DeliveryMethod,
  LotStatus,
  MessageType,
  OfferStatus,
  PaymentMethodRecorded,
  PricingType,
  type Conversation,
  type Deal,
  type DealEvent,
  type Offer,
  type Prisma,
  type User,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ConversationsRepository } from '../conversations/conversations.repository';
import { truncatePreview } from '../conversations/conversations.constants';
import { LotsRepository, type LotWithMedia } from '../lots/lots.repository';
import { OffersRepository } from '../offers/offers.repository';
import { UsersRepository } from '../users/users.repository';
import { DealsRepository } from './deals.repository';
import {
  DEAL_CODE_CREATE_ATTEMPTS,
  DEAL_COMMISSION_RATE_BASIS_POINTS,
  DEAL_DISPUTE_REASON_MIN_LENGTH,
  DEAL_ERROR_CODES,
  DEAL_MAX_TOTAL_PRICE,
  DEAL_MAX_UNIT_PRICE,
  DEAL_MIN_UNIT_PRICE,
  DEAL_NOTE_MAX_LENGTH,
  REASON_FIELDS,
  STAGE_TIMESTAMP_FIELDS,
  assertTransition,
  dealCreatedActionBody,
  generateDealCode,
  paymentConfirmedActionBody,
  transitionRuleFor,
  type DealReasonField,
  type DealRole,
  type DealStageTimestampField,
} from './deals.constants';
import {
  toDealResponse,
  type DealResponseDto,
  type DealResponseRow,
} from './dto/deal-response.dto';
import type { TransitionDealDto } from './dto/transition-deal.dto';
import type { CreateDealDto } from './dto/create-deal.dto';

type Tx = Prisma.TransactionClient | undefined;

/** Prisma unique-violation probe (works on real client errors and plain
 * fakes) — the Deal.code collision signal for the create retry loop. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}

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
 * stamps, timeline) plus DEAL-002's creation API half (POST /deals, both
 * paths, the quantity reservation).
 *
 * Documented decisions carried from the cards:
 * - The buyer's «پرداخت کردم» is NOT a transition: DEAL-006's payment-confirm
 *   endpoint stamps `paidConfirmedByBuyerAt` + appends an informational
 *   DealEvent (fromStatus = toStatus = PAYMENT_PENDING, note «خریدار پرداخت
 *   را اعلام کرد») and notifies the seller; only the SELLER's confirm moves
 *   PAYMENT_PENDING → PAID (the matrix row). Hook point — DEAL-006.
 * - DELIVERED→COMPLETED auto-confirms after 7 days. That is a jobs-module
 *   sweep (the OFR-003/LOT-006 pattern) — NOT this card. The sweep must go
 *   through THIS transition method (system event: actorId null, role BUYER's
 *   DELIVERED→COMPLETED row); do not widen the table for it.
 * - →CANCELLED restores the reserved quantity (DEAL-002's reservation pair)
 *   inside the SAME transaction as the cancelling write, but ONLY for the
 *   "clean" cancellations: those from the pre-fulfilment stages NEGOTIATING /
 *   AGREED / PAYMENT_PENDING (per the DEAL-003 card's "restores unless
 *   status ≥ PREPARING"; all three are < PREPARING). DISPUTED→CANCELLED (the
 *   DEAL-007 admin resolution) deliberately does NOT auto-restore: a disputed
 *   deal may already have progressed past PAID (goods shipped), so restore-
 *   or-keep is the resolution's explicit outcome decision (DEAL-007 card:
 *   "resolution restores/keeps qty per outcome").
 * - Self-dealing needs no guard here: both creation paths inherit
 *   buyer ≠ seller from their upstream preconditions (offers are created
 *   with 403 SELF_OFFER; conversations with 403 SELF_CONVERSATION).
 */
@Injectable()
export class DealsService {
  constructor(
    private readonly repository: DealsRepository,
    private readonly prisma: PrismaService,
    /** Cross-module reads/writes through the owning modules' repositories —
     * the OFR-002 pattern (offers.service injects Lots/Conversations/Users
     * repositories the same way; ConversationsService.sendMessage opens its
     * own transaction and cannot compose into ours, so the ACTION message is
     * written through the repository with OUR tx client). */
    private readonly lots: LotsRepository,
    private readonly offers: OffersRepository,
    private readonly conversations: ConversationsRepository,
    private readonly users: UsersRepository,
  ) {}

  /**
   * The single status-write gate + executor: asserts the move against
   * DEAL_TRANSITIONS (409 ILLEGAL_TRANSITION for an unknown (from, to) pair,
   * 403 TRANSITION_ROLE_FORBIDDEN for a role denial), requires the note on
   * reason-requiring rows (400 REASON_REQUIRED — every →CANCELLED and
   * →DISPUTED), then writes status + the target stage's timestamp (+ the
   * cancelReason/disputeReason column) AND the DealEvent in ONE transaction
   * (join the caller's via `tx`; without one the helper opens its own) — plus
   * the →CANCELLED quantity restore for the clean cancellations (the class
   * doc carries the rule; the event note carries the trimmed reason, so the
   * timeline alone tells the whole story, principle 13).
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
    // The dispute-reason floor (DEAL-003, card: "reason ≥ 20 chars"): a
    // dispute opens the P1 support flow, so a too-short reason is rejected up
    // front — for EVERY →DISPUTED writer (participants now, the DEAL-007
    // admin flow included), the shared gate owns the rule.
    if (to === DealStatus.DISPUTED && note !== null) {
      const length = codePointLength(note);
      if (length < DEAL_DISPUTE_REASON_MIN_LENGTH) {
        throw new BadRequestException({
          code: DEAL_ERROR_CODES.DISPUTE_REASON_TOO_SHORT,
          message: `A dispute reason must be at least ${DEAL_DISPUTE_REASON_MIN_LENGTH} characters`,
        });
      }
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
      // The GUARDED write (DEAL-003): the matrix was asserted against a row
      // read OUTSIDE this transaction, so the write re-checks the status —
      // a concurrent move (both parties cancelling at once, a cancel racing
      // a stage advance) answers 409 here instead of double-applying a move
      // (the restore below stays single-fire with it).
      const moved = await this.repository.updateIfStatus(deal.id, deal.status, data, client);
      if (moved === 0) {
        throw new ConflictException({
          code: DEAL_ERROR_CODES.DEAL_STALE_STATE,
          message: `The deal is no longer ${deal.status} — reload it and retry`,
        });
      }
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
      // The reservation RESTORE (DEAL-002's reserve/restore pair): every
      // "clean" cancellation frees the deal's quantity in the SAME
      // transaction as the cancelling write (atomicity — a crash rolls both
      // back). The condition encodes the documented rule (class doc): a
      // legal →CANCELLED move originates from NEGOTIATING / AGREED /
      // PAYMENT_PENDING (all restore) or DISPUTED (admin resolution — no
      // auto-restore, DEAL-007 decides per outcome). Terminal CANCELLED can
      // never re-enter (the matrix forbids it), so a double-restore is
      // unreachable.
      if (to === DealStatus.CANCELLED && deal.status !== DealStatus.DISPUTED) {
        await this.lots.restoreQuantity(deal.lotId, deal.quantity, client);
      }
      // Read back INSIDE the transaction — the write's row lock holds until
      // commit, so this reflects this writer's move, not a racer's.
      const updated = await this.repository.findById(deal.id, client);
      if (!updated) {
        // Unreachable: the guarded write just matched this row.
        throw new Error('Unreachable: the transition tx lost its own deal row');
      }
      return updated;
    };
    return tx !== undefined ? run(tx) : this.prisma.$transaction(async (client) => run(client));
  }

  /**
   * POST /deals (DEAL-002, buyer-initiated) — strike a deal FROM exactly one
   * of two sources (`offerId` XOR `conversationId`, both 400-guarded):
   *
   * (a) OFFER PATH — an ACCEPTED offer (OFR-002's acceptance created the
   *     eligibility): the offer row IS the agreed commercial terms, so
   *     quantity/unitPrice/totalPrice are snapshotted FROM THE OFFER and the
   *     payload may only CONFIRM them — a quantity (required) or unitPrice
   *     (optional echo) that disagrees is 400 OFFER_TERMS_MISMATCH, never a
   *     renegotiation (a different deal is a new offer; the card's
   *     "confirmation payload locks terms"). The thread tie for the ACTION
   *     message comes from the OFFER's own conversationId when it has one.
   * (b) CONVERSATION QUICK PATH — directly from a thread, FIXED-price lots
   *     only (409 LOT_NOT_FIXED_PRICE otherwise — documented decision: the
   *     quick path has no price surface, and a NEGOTIABLE lot has no agreed
   *     price to confirm, so it must go through offers first). unitPrice is
   *     locked to lot.unitPrice (the derived asking unit price): the payload
   *     may omit it or echo it; a disagreeing echo is 400 DEAL_PRICE_LOCKED.
   *     quantity is the buyer's chosen amount.
   *
   * Precondition order (hats before probing, the module chain's convention):
   *   1. user row still exists (401 — behind the global guard)
   *   2. BUYER hat (403 BUYER_REQUIRED)
   *   3. exactly one provenance id (400 PROVENANCE_REQUIRED / _EXCLUSIVE)
   *   4. source row: unknown offer → 404; foreign offer → 403
   *      OFFER_NOT_BUYER; unknown OR foreign conversation → 403
   *      CONVERSATION_NOT_YOURS (uniform — no existence oracle for
   *      unguessable ids, the OFR-002 precedent)
   *   5. offer state: EXPIRED → 409 OFFER_EXPIRED (specific); any other
   *      non-ACCEPTED status → 409 OFFER_NOT_ACCEPTED (the card's "bad offer
   *      state", surfaced as the repo-wide 409 state/conflict with explicit
   *      codes — the deviation from the card's "400" shorthand is documented
   *      on DEAL_ERROR_CODES). This service NEVER writes offer rows (write-
   *      domain boundary): a PENDING offer past due is NOT lazily flipped
   *      here — that stays OFR-002's guard + the OFR-003 sweep.
   *   6. lot: loaded from the source row (404 if gone), ACTIVE required
   *      (409 LOT_NOT_ACTIVE), then the shared DEAL-001 validator
   *      (validateDealInput: 400 price/note shape, 409 quantity vs the
   *      CURRENT availableQuantity, offer-lot wiring).
   *
   * THE TRANSACTION (one prisma.$transaction — atomicity is the card's
   * "reserve qty transactionally"):
   *   1. LotsRepository.reserveQuantity — the conditional decrement; 0 rows
   *      matched → 409 INSUFFICIENT_QUANTITY (the race-safe guard between
   *      the validator's visible-state check and the write).
   *   2. the deal row (fresh generateDealCode()) + its birth DealEvent.
   *   3. when tied to a thread: the ACTION message («معامله ایجاد شد
   *      #CODE», sender = the buyer) + the conversation lockstep, written
   *      through ConversationsRepository with THIS tx client.
   * A failure at ANY step aborts the whole transaction: no deal, no message,
   * and — the reservation rollback guarantee — no decrement persists. A
   * Deal.code collision (P2002) retries the WHOLE transaction with a fresh
   * code (DEAL_CODE_CREATE_ATTEMPTS budget — the schema pins retries to this
   * layer); everything else propagates.
   *
   * NTF hook point (deal.created — notify the seller) — realized P1.
   */
  async create(buyerId: string, dto: CreateDealDto): Promise<DealResponseDto> {
    const user = await this.requireUser(buyerId);
    this.assertBuyerHat(user);

    const hasOffer = dto.offerId !== undefined;
    const hasConversation = dto.conversationId !== undefined;
    if (!hasOffer && !hasConversation) {
      throw new BadRequestException({
        code: DEAL_ERROR_CODES.PROVENANCE_REQUIRED,
        message: 'Provide exactly one of offerId or conversationId',
      });
    }
    if (hasOffer && hasConversation) {
      throw new BadRequestException({
        code: DEAL_ERROR_CODES.PROVENANCE_EXCLUSIVE,
        message:
          'offerId and conversationId are mutually exclusive — the offer path takes its thread from the offer itself',
      });
    }

    const offerId = dto.offerId;
    const conversationIdInput = dto.conversationId;
    let offer: Offer | null = null;
    let conversation: Conversation | null = null;
    let lot: LotWithMedia | null = null;
    if (offerId !== undefined) {
      offer = await this.requireOwnedAcceptedOffer(buyerId, offerId, dto);
      lot = await this.lots.findById(offer.lotId);
    } else {
      conversation = await this.requireOwnConversation(buyerId, conversationIdInput as string);
      lot = await this.lots.findById(conversation.lotId);
    }
    if (!lot) {
      throw new NotFoundException('Lot not found');
    }
    if (lot.status !== LotStatus.ACTIVE) {
      throw new ConflictException({
        code: DEAL_ERROR_CODES.LOT_NOT_ACTIVE,
        message: 'Deals can only be made on active lots',
      });
    }
    // Quick-path pricing gate (path (b) only): the lot must be FIXED — the
    // documented scope decision on create(). The offer path is inherently
    // safe (its price came from the accepted offer).
    if (offer === null && lot.pricingType !== PricingType.FIXED) {
      throw new ConflictException({
        code: DEAL_ERROR_CODES.LOT_NOT_FIXED_PRICE,
        message:
          'The conversation quick path is only for fixed-price lots — negotiate through offers first',
      });
    }
    // …and the payload's price echo may CONFIRM lot.unitPrice, never change
    // it (the actual snapshot below reads the lot row regardless).
    if (offer === null && dto.unitPrice !== undefined && dto.unitPrice !== lot.unitPrice) {
      throw new BadRequestException({
        code: DEAL_ERROR_CODES.DEAL_PRICE_LOCKED,
        message: `unitPrice is locked to the lot's fixed price (${lot.unitPrice}) — the quick path has no price negotiation`,
      });
    }

    // The snapshot terms: the OFFER's on path (a), the LOT's price + the
    // payload's quantity on path (b). validateDealInput is the ONE shared
    // create-validator (400 price/note shape, 409 quantity vs availability,
    // offer-lot wiring) — the same rules DEAL-001 pinned.
    const validated = validateDealInput(
      {
        quantity: offer !== null ? offer.quantity : dto.quantity,
        unitPrice: offer !== null ? offer.unitPrice : lot.unitPrice,
        deliveryMethod: dto.deliveryMethod,
        paymentMethod: dto.paymentMethod,
        deliveryNote: dto.deliveryNote,
        paymentTermsNote: dto.paymentTermsNote,
      },
      { id: lot.id, availableQuantity: lot.availableQuantity },
      offer !== null ? { id: offer.id, lotId: offer.lotId } : undefined,
    );

    const threadId: string | null =
      offer !== null ? offer.conversationId : (conversation?.id ?? null);
    const created = await this.createWithReservation({
      buyerId,
      lot,
      validated,
      offerId: offer?.id ?? null,
      conversationId: threadId,
    });
    // NTF hook point (deal.created) — realized P1.
    return toDealResponse({ ...created, lot: { code: lot.code, title: lot.title } }, 'buyer');
  }

  // --- DEAL-002 helpers (order documented per method) ---

  /**
   * The authenticated user row (401 when the token user is gone — the same
   * rule every service applies behind the global guard).
   */
  private async requireUser(userId: string): Promise<User> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }
    return user;
  }

  /** 403 + BUYER_REQUIRED without the BUYER hat (the card's buyer-initiated
   * rule — mirrors offers.create / CHT-001). */
  private assertBuyerHat(user: User): void {
    if (!user.accountRoles.includes(AccountRole.BUYER)) {
      throw new ForbiddenException({
        code: DEAL_ERROR_CODES.BUYER_REQUIRED,
        message: 'Only buyer accounts can create deals',
      });
    }
  }

  /**
   * Offer-path source resolution: the offer must exist (404), be the
   * CALLER's (403 OFFER_NOT_BUYER — ownership gates before state, the
   * offers.cancel precedent) and be ACCEPTED (409 OFFER_EXPIRED for the
   * expired row specifically, 409 OFFER_NOT_ACCEPTED for every other
   * non-accepted status). Finally the payload terms are checked against the
   * offer's locked terms (400 OFFER_TERMS_MISMATCH — see create() path (a)).
   */
  private async requireOwnedAcceptedOffer(
    buyerId: string,
    offerId: string,
    dto: CreateDealDto,
  ): Promise<Offer> {
    const offer = await this.offers.findById(offerId);
    if (!offer) {
      throw new NotFoundException('Offer not found');
    }
    if (offer.buyerId !== buyerId) {
      throw new ForbiddenException({
        code: DEAL_ERROR_CODES.OFFER_NOT_BUYER,
        message: 'Only the buyer who made this offer can create a deal from it',
      });
    }
    if (offer.status === OfferStatus.EXPIRED) {
      throw new ConflictException({
        code: DEAL_ERROR_CODES.OFFER_EXPIRED,
        message: 'This offer has expired',
      });
    }
    if (offer.status !== OfferStatus.ACCEPTED) {
      throw new ConflictException({
        code: DEAL_ERROR_CODES.OFFER_NOT_ACCEPTED,
        message: `Deals grow only out of ACCEPTED offers — this one is ${offer.status}`,
      });
    }
    if (dto.quantity !== offer.quantity) {
      throw new BadRequestException({
        code: DEAL_ERROR_CODES.OFFER_TERMS_MISMATCH,
        message: `quantity must match the accepted offer (${offer.quantity}) — deal terms are snapshotted from the offer, not renegotiated`,
      });
    }
    if (dto.unitPrice !== undefined && dto.unitPrice !== offer.unitPrice) {
      throw new BadRequestException({
        code: DEAL_ERROR_CODES.OFFER_TERMS_MISMATCH,
        message: `unitPrice must match the accepted offer (${offer.unitPrice}) — deal terms are snapshotted from the offer, not renegotiated`,
      });
    }
    return offer;
  }

  /**
   * Conversation-path source resolution: unknown AND foreign threads answer
   * the SAME 403 CONVERSATION_NOT_YOURS (uniform — no existence oracle for
   * unguessable conversation ids; the OFR-002 documented precedent).
   */
  private async requireOwnConversation(
    buyerId: string,
    conversationId: string,
  ): Promise<Conversation> {
    const conversation = await this.conversations.findById(conversationId);
    if (!conversation || conversation.buyerId !== buyerId) {
      throw new ForbiddenException({
        code: DEAL_ERROR_CODES.CONVERSATION_NOT_YOURS,
        message: 'This conversation does not exist or is not yours',
      });
    }
    return conversation;
  }

  /**
   * The create transaction (retried whole on a Deal.code P2002 collision —
   * reserve → deal row + birth event → ACTION message; see create() for the
   * step contract). The quantity term is always locked by now: the offer's
   * on path (a), the buyer's validated choice on path (b).
   */
  private async createWithReservation(args: {
    buyerId: string;
    lot: { id: string; sellerId: string };
    validated: ValidatedDealTerms;
    offerId: string | null;
    conversationId: string | null;
  }): Promise<Deal> {
    const { buyerId, lot, validated, offerId, conversationId } = args;

    for (let attempt = 1; attempt <= DEAL_CODE_CREATE_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          // 1. RESERVE — the conditional decrement IS the race-safe
          // availability guard; 0 matched rows means the stock vanished
          // between validation and the write (409, tx aborts, nothing
          // persists).
          const reserved = await this.lots.reserveQuantity(lot.id, validated.quantity, tx);
          if (reserved === 0) {
            throw new ConflictException({
              code: DEAL_ERROR_CODES.INSUFFICIENT_QUANTITY,
              message: `The lot no longer has ${validated.quantity} pieces available`,
            });
          }
          // 2. THE DEAL + its birth event (timeline total from birth; the
          // fa note doubles as the thread announcement copy).
          const code = generateDealCode();
          const deal = await this.repository.create(
            {
              deal: {
                code,
                lotId: lot.id,
                buyerId,
                sellerId: lot.sellerId,
                offerId,
                conversationId,
                quantity: validated.quantity,
                unitPrice: validated.unitPrice,
                totalPrice: validated.totalPrice,
                deliveryMethod: validated.deliveryMethod,
                deliveryNote: validated.deliveryNote,
                paymentMethod: validated.paymentMethod,
                paymentTermsNote: validated.paymentTermsNote,
                commissionRate: validated.commissionRate,
              },
              event: creationEvent({ actorId: buyerId, note: dealCreatedActionBody(code) }),
            },
            tx,
          );
          // 3. The thread announcement + lockstep (atomic with the deal).
          if (conversationId !== null) {
            await this.postActionMessage(conversationId, buyerId, dealCreatedActionBody(code), tx);
          }
          return deal;
        });
      } catch (error) {
        // Unique-code collision: fresh code, whole transaction again (the
        // rollback already un-reserved the quantity). Everything else
        // propagates; exhausting the budget rethrows the last violation.
        if (!isUniqueViolation(error) || attempt === DEAL_CODE_CREATE_ATTEMPTS) {
          throw error;
        }
      }
    }
    // Unreachable (the loop either returned or threw) — satisfies the type
    // checker without polluting the call site.
    throw new Error('Unreachable: the deal-create retry loop must return or throw');
  }

  /**
   * The ACTION message half of the create transaction — mirrors the offers
   * module's lockstep exactly: the message row (type ACTION — TEXT-in-ACTION:
   * body is the fa template, sender = the acting party = the buyer; no
   * structured payloads until feature #19) + the conversation's
   * lastMessageAt / lastMessagePreview + the COUNTERPART's (seller's) unread
   * increment. Runs inside the CALLER's transaction (tx required) so the
   * deal write and its thread announcement commit or roll back atomically.
   */
  private async postActionMessage(
    conversationId: string,
    senderId: string,
    body: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const conversation = await this.conversations.findById(conversationId, tx);
    if (!conversation) {
      // Unreachable through the API (the tie was validated upstream and the
      // FK is Cascade/SetNull-safe); a direct call with a dead id must not
      // fail the deal transaction for the message's sake.
      return;
    }
    const sentAt = new Date();
    await this.conversations.createMessage(
      { conversationId, senderId, type: MessageType.ACTION, body },
      tx,
    );
    await this.conversations.updateConversation(
      conversationId,
      {
        lastMessageAt: sentAt,
        lastMessagePreview: truncatePreview(body),
        ...(conversation.buyerId === senderId
          ? { sellerUnreadCount: { increment: 1 } }
          : { buyerUnreadCount: { increment: 1 } }),
      },
      tx,
    );
  }

  // --- DEAL-003 (transition endpoints) ---

  /**
   * The participant gate every /deals/:code route shares: load the row (+ the
   * lot summary the response carries), then resolve the caller's hat —
   * unknown code → 404 DEAL_NOT_FOUND (codes are unguessable capability
   * handles), anyone but the two participants → 403 DEAL_NOT_PARTICIPANT
   * (admin surfaces come with DEAL-007; the matrix's ADMIN rows stay
   * endpoint-less until then).
   */
  private async resolveParticipant(
    code: string,
    userId: string,
  ): Promise<{ deal: DealResponseRow; role: DealRole }> {
    const deal = await this.repository.findByCodeWithLot(code);
    if (!deal) {
      throw new NotFoundException({
        code: DEAL_ERROR_CODES.DEAL_NOT_FOUND,
        message: 'Deal not found',
      });
    }
    const role: DealRole | null =
      deal.buyerId === userId ? 'BUYER' : deal.sellerId === userId ? 'SELLER' : null;
    if (role === null) {
      throw new ForbiddenException({
        code: DEAL_ERROR_CODES.DEAL_NOT_PARTICIPANT,
        message: 'Only the deal’s buyer or seller can do this',
      });
    }
    return { deal, role };
  }

  /** The allowlisted response for a resolved participant (myRole mirrors the
   * hat — lowercase in the payload contract). resolveParticipant only yields
   * the two participant hats; ADMIN arrives with DEAL-007's endpoints, which
   * get their own mapping then. */
  private toParticipantResponse(row: DealResponseRow, role: DealRole): DealResponseDto {
    return toDealResponse(row, role === 'SELLER' ? 'seller' : 'buyer');
  }

  /**
   * POST /deals/:code/transition — participant gate, then the ONE matrix gate
   * (this.transition: 409 ILLEGAL_TRANSITION with the allowed-next-states
   * payload, 403 TRANSITION_ROLE_FORBIDDEN, 400 REASON_REQUIRED /
   * DISPUTE_REASON_TOO_SHORT, the guarded write + DealEvent append, the
   * clean-cancel quantity restore). The answer is the freshly-written
   * allowlisted deal.
   */
  async transitionFromCode(
    code: string,
    userId: string,
    dto: TransitionDealDto,
  ): Promise<DealResponseDto> {
    const { deal, role } = await this.resolveParticipant(code, userId);
    const updated = await this.transition(deal, dto.to, role, {
      actorId: userId,
      note: dto.note,
    });
    return this.toParticipantResponse({ ...updated, lot: deal.lot }, role);
  }

  /**
   * POST /deals/:code/cancel — the reason-shaped shorthand for
   * `to: CANCELLED`: same matrix row (WHO may cancel depends on the current
   * status), the reason lands in cancelReason + the timeline note, and clean
   * cancellations get their reserved quantity back (transition's restore).
   */
  async cancelFromCode(code: string, userId: string, reason: string): Promise<DealResponseDto> {
    return this.transitionFromCode(code, userId, { to: DealStatus.CANCELLED, note: reason });
  }

  /**
   * POST /deals/:code/payment-confirm — the buyer's «پرداخت کردم» mark.
   * Deliberately NOT a transition (the class doc): the status only moves when
   * the SELLER confirms (PAYMENT_PENDING→PAID, the matrix row); this stamps
   * `paidConfirmedByBuyerAt` + appends the informational event
   * (PAYMENT_PENDING→PAYMENT_PENDING, «خریدار پرداخت را اعلام کرد») so the
   * timeline shows the announcement. The write is one conditional
   * updateMany (repository.markPaymentConfirmed) + the event in ONE
   * transaction — a race loser answers 409 with the re-read reason.
   *
   * NTF hook point (deal.paymentAnnounced — notify the seller) — realized P1.
   */
  async confirmPaymentFromCode(
    code: string,
    userId: string,
    now: Date = new Date(),
  ): Promise<DealResponseDto> {
    const { deal, role } = await this.resolveParticipant(code, userId);
    if (role !== 'BUYER') {
      throw new ForbiddenException({
        code: DEAL_ERROR_CODES.PAYMENT_CONFIRM_BUYER_ONLY,
        message: 'Only the buyer can announce payment',
      });
    }
    const reject = (reason: 'NOT_PENDING' | 'ALREADY_CONFIRMED'): ConflictException =>
      new ConflictException(
        reason === 'ALREADY_CONFIRMED'
          ? {
              code: DEAL_ERROR_CODES.PAYMENT_ALREADY_CONFIRMED,
              message: 'Payment was already announced for this deal',
            }
          : {
              code: DEAL_ERROR_CODES.PAYMENT_NOT_PENDING,
              message: `Payment can only be announced while the deal is PAYMENT_PENDING — it is ${deal.status}`,
            },
      );
    if (deal.status !== DealStatus.PAYMENT_PENDING) {
      throw reject('NOT_PENDING');
    }
    if (deal.paidConfirmedByBuyerAt !== null) {
      throw reject('ALREADY_CONFIRMED');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const marked = await this.repository.markPaymentConfirmed(deal.id, now, tx);
      if (marked === 0) {
        // The race loser: re-read to name which precondition vanished.
        const fresh = (await this.repository.findById(deal.id, tx)) ?? deal;
        throw reject(fresh.paidConfirmedByBuyerAt !== null ? 'ALREADY_CONFIRMED' : 'NOT_PENDING');
      }
      await this.repository.appendEvent(
        {
          dealId: deal.id,
          actorId: userId,
          fromStatus: DealStatus.PAYMENT_PENDING,
          toStatus: DealStatus.PAYMENT_PENDING,
          note: paymentConfirmedActionBody(),
          createdAt: now,
        },
        tx,
      );
      const row = await this.repository.findById(deal.id, tx);
      if (!row) {
        // Unreachable: the row was just updated inside this transaction.
        throw new Error('Unreachable: the payment-confirm tx lost its own deal row');
      }
      return row;
    });
    return this.toParticipantResponse({ ...updated, lot: deal.lot }, role);
  }

  /**
   * The audit timeline of one deal, oldest first — passthrough to the
   * repository (DEAL-004 renders it; DEAL-007's investigation view too).
   */
  async timeline(dealId: string, tx: Tx = undefined): Promise<DealEvent[]> {
    return this.repository.findEvents(dealId, tx);
  }
}
