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
  LotStatus,
  MessageType,
  OfferStatus,
  type Conversation,
  type Offer,
  type Prisma,
  type User,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { Paginated } from '../../common/dto/pagination-query.dto';
import { ConversationsRepository } from '../conversations/conversations.repository';
import { truncatePreview } from '../conversations/conversations.constants';
import { LotsRepository, type LotWithMedia } from '../lots/lots.repository';
import { UsersRepository } from '../users/users.repository';
import { OffersRepository } from './offers.repository';
import {
  OFFER_ERROR_CODES,
  OFFER_EXPIRY_DAYS,
  OFFER_MAX_TOTAL_PRICE,
  OFFER_MAX_UNIT_PRICE,
  OFFER_MIN_UNIT_PRICE,
  OFFER_NOTE_MAX_LENGTH,
  assertTransition,
  offerAcceptedActionBody,
  offerActionMessageBody,
  offerRejectedActionBody,
} from './offers.constants';
import { toOfferResponse, lotSummaryOf, type OfferResponseDto } from './dto/offer-response.dto';
import type { CreateOfferDto } from './dto/create-offer.dto';
import type { CounterOfferDto } from './dto/counter-offer.dto';
import type { OfferListQueryDto, LotOffersQueryDto } from './dto/offer-query.dto';

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
export type OfferableLot = Pick<LotWithMedia, 'status' | 'minOrderQuantity' | 'availableQuantity'>;

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
 * Offer business rules — OFR-001's domain half (transition gate, counter
 * chains, sibling invalidation) plus OFR-002's API half (the role-gated
 * endpoints' service layer).
 *
 * OFR-002 decisions (documented per method below):
 * - EXPIRY is LAZY: every mutating action re-checks `expiresAt`; a PENDING
 *   offer past due is flipped to EXPIRED (persisted — idempotent and honest,
 *   the row truly is expired) and the caller gets 409 OFFER_EXPIRED. An
 *   already-flipped EXPIRED row answers 409 ILLEGAL_TRANSITION instead (the
 *   transition table owns that move) — both are terminal, only the code
 *   differs. The OFR-003 hourly sweep remains the bulk stamper; this is the
 *   per-row backstop.
 * - The conversation ACTION messages are written THROUGH
 *   ConversationsRepository with the offer's OWN transaction client — they
 *   must commit or roll back atomically with the offer write, and
 *   ConversationsService.sendMessage opens its own transaction (nested-tx
 *   semantics would break that). This mirrors CHT-003's send lockstep
 *   exactly: message row (type ACTION, sender = the acting party) +
 *   conversation lastMessageAt/lastMessagePreview + COUNTERPART unread
 *   increment.
 * - Notification hook points are COMMENTS (NTF realized P1, like the other
 *   modules); no deal rows are written here — acceptance creates the
 *   DEAL-002 eligibility, nothing more.
 */
@Injectable()
export class OffersService {
  constructor(
    private readonly repository: OffersRepository,
    private readonly lots: LotsRepository,
    private readonly users: UsersRepository,
    private readonly conversations: ConversationsRepository,
    private readonly prisma: PrismaService,
  ) {}

  // ------------------------------------------------------------------
  // OFR-001 — domain core (transition gate, chains, sibling invalidation)
  // ------------------------------------------------------------------

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
   * written. Returns the flipped parent (COUNTERED + decidedAt), the new
   * PENDING child (parentId → parent, own fresh 72 h expiry) and the CURRENT
   * lot row (OFR-002's counter endpoint needs its `unit` for the ACTION
   * message body without a second read). Pass `tx` to join the caller's
   * transaction (OFR-002 keeps the counter + its ACTION message atomic);
   * without one the helper opens its own.
   */
  async createCounter(
    parent: Offer,
    input: OfferTermsInput,
    now: Date = new Date(),
    tx: Tx = undefined,
  ): Promise<{ parent: Offer; child: Offer; lot: LotWithMedia }> {
    assertTransition(parent.status, OfferStatus.COUNTERED);

    const lot = await this.lots.findById(parent.lotId);
    if (!lot) {
      throw new NotFoundException('Lot not found');
    }
    const validated = validateOfferInput(input, lot, now);

    const run = async (client: Tx): Promise<{ parent: Offer; child: Offer; lot: LotWithMedia }> => {
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
        client,
      );
      const countered = await this.repository.update(
        parent.id,
        { status: OfferStatus.COUNTERED, decidedAt: now },
        client,
      );
      return { parent: countered, child, lot };
    };
    return tx !== undefined ? run(tx) : this.prisma.$transaction(async (client) => run(client));
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

  // ------------------------------------------------------------------
  // OFR-002 — the Offers API
  // ------------------------------------------------------------------

  /**
   * POST /offers — a buyer offers on an ACTIVE lot. Precondition order
   * (hats before probing, the module chain's convention):
   *
   * 1. authenticated (401 by the global guard) + user row still exists (401)
   * 2. BUYER hat (403 BUYER_REQUIRED — before lot probing)
   * 3. lot exists (404 — uniform, no oracle for why)
   * 4. requester is NOT the lot's seller (403 SELF_OFFER — the card's
   *    "buyer ≠ seller"; dual-hat sellers included)
   * 5. optional conversationId ties the offer to a thread: the conversation
   *    must exist AND be the caller's as the BUYER — unknown and foreign
   *    answer the SAME 403 CONVERSATION_NOT_YOURS (no existence oracle for
   *    unguessable conversation ids; the MEDIA_NOT_OWNED precedent) — and
   *    must belong to the SAME lot (400 CONVERSATION_LOT_MISMATCH: a
   *    cross-lot thread link is a client bug, not a probeable resource)
   * 6. OFR-001 create-validation (400 price/note, 409 lot/qty)
   *
   * The transaction writes the PENDING offer (+72 h expiry) AND — when tied
   * to a conversation — the ACTION message («پیشنهاد … تومان برای … عدد»,
   * sender = the buyer) plus the conversation lockstep, atomically.
   */
  async create(buyerId: string, dto: CreateOfferDto): Promise<OfferResponseDto> {
    const user = await this.requireUser(buyerId);
    this.assertBuyerHat(user);

    const lot = await this.lots.findById(dto.lotId);
    if (!lot) {
      throw new NotFoundException('Lot not found');
    }
    if (lot.sellerId === buyerId) {
      throw new ForbiddenException({
        code: OFFER_ERROR_CODES.SELF_OFFER,
        message: 'You cannot offer on your own lot',
      });
    }

    let conversation: Conversation | null = null;
    if (dto.conversationId !== undefined) {
      const found = await this.conversations.findById(dto.conversationId);
      if (!found || found.buyerId !== buyerId) {
        // Uniform 403 for unknown AND foreign threads (documented above).
        throw new ForbiddenException({
          code: OFFER_ERROR_CODES.CONVERSATION_NOT_YOURS,
          message: 'This conversation does not exist or is not yours',
        });
      }
      if (found.lotId !== lot.id) {
        throw new BadRequestException({
          code: OFFER_ERROR_CODES.CONVERSATION_LOT_MISMATCH,
          message: 'The conversation belongs to a different lot',
        });
      }
      conversation = found;
    }

    const validated = validateOfferInput(
      { quantity: dto.quantity, unitPrice: dto.unitPrice, note: dto.note },
      lot,
    );
    const offer = await this.prisma.$transaction(async (tx) => {
      const created = await this.repository.create(
        {
          lotId: lot.id,
          buyerId,
          sellerId: lot.sellerId,
          conversationId: conversation?.id ?? null,
          quantity: validated.quantity,
          unitPrice: validated.unitPrice,
          totalPrice: validated.totalPrice,
          note: validated.note,
          status: OfferStatus.PENDING,
          expiresAt: validated.expiresAt,
        },
        tx,
      );
      if (conversation !== null) {
        // NTF hook point (offer.created) — realized P1.
        await this.postActionMessage(
          conversation.id,
          buyerId,
          offerActionMessageBody(created.totalPrice, created.quantity, lot.unit),
          tx,
        );
      }
      return created;
    });
    return toOfferResponse({ ...offer, lot: lotSummaryOf(lot) }, 'buyer');
  }

  /**
   * POST /offers/:id/counter — the seller answers with a CHILD offer (the
   * countered row is history, never mutated). SELLER hat (403
   * SELLER_REQUIRED), offer exists (404), caller sells THIS offer's lot (403
   * OFFER_NOT_SELLER), lazy expiry (409 OFFER_EXPIRED), then
   * OffersService.createCounter: re-validates the terms against the CURRENT
   * lot row (stale quantity/price → 400/409 per validateOfferInput) and
   * writes child + parent flip in one transaction — here joined with the
   * ACTION message into the tied thread (sender = the seller) so the whole
   * counter commits or rolls back atomically.
   */
  async counter(
    sellerId: string,
    offerId: string,
    dto: CounterOfferDto,
  ): Promise<OfferResponseDto> {
    const user = await this.requireUser(sellerId);
    this.assertSellerHat(user);

    const parent = await this.repository.findById(offerId);
    if (!parent) {
      throw new NotFoundException('Offer not found');
    }
    if (parent.sellerId !== sellerId) {
      throw new ForbiddenException({
        code: OFFER_ERROR_CODES.OFFER_NOT_SELLER,
        message: 'Only the seller of this offer’s lot can counter it',
      });
    }
    await this.expireIfDue(parent);

    const { child, lot } = await this.prisma.$transaction(async (tx) => {
      const created = await this.createCounter(parent, dto, new Date(), tx);
      if (parent.conversationId !== null) {
        await this.postActionMessage(
          parent.conversationId,
          sellerId,
          offerActionMessageBody(
            created.child.totalPrice,
            created.child.quantity,
            created.lot.unit,
          ),
          tx,
        );
      }
      return created;
    });
    return toOfferResponse({ ...child, lot: lotSummaryOf(lot) }, 'seller');
  }

  /**
   * POST /offers/:id/accept — the seller accepts. Same role chain as
   * counter, then, in order (the card's checks): lazy expiry (409
   * OFFER_EXPIRED), lot still ACTIVE (409 LOT_NOT_ACTIVE), CURRENT
   * availableQuantity ≥ offer.quantity (409 STALE_QUANTITY — the
   * revalidation rule; the message carries both counts, fa copy renders
   * web-side). The transaction: ACCEPTED + invalidateSiblings (the buyer's
   * other PENDING offers on the lot auto-REJECT) + the ACTION message
   * («پیشنهاد پذیرفته شد») into the tied thread.
   *
   * DEAL-ELIGIBILITY HOOK (DEAL-002 consumes): THIS accepted offer IS the
   * deal-creation eligibility — DEAL-002's POST /deals validates
   * {offerId} → status ACCEPTED + buyer = caller, snapshots lot/qty/price
   * and reserves quantity. No deal rows are written here (card: "deal
   * created explicitly by parties in DEAL-002 but acceptance creates the
   * eligibility"). NTF hook point (offer.accepted) — realized P1.
   */
  async accept(sellerId: string, offerId: string): Promise<OfferResponseDto> {
    const user = await this.requireUser(sellerId);
    this.assertSellerHat(user);

    const offer = await this.repository.findById(offerId);
    if (!offer) {
      throw new NotFoundException('Offer not found');
    }
    if (offer.sellerId !== sellerId) {
      throw new ForbiddenException({
        code: OFFER_ERROR_CODES.OFFER_NOT_SELLER,
        message: 'Only the seller of this offer’s lot can accept it',
      });
    }
    await this.expireIfDue(offer);

    const lot = await this.lots.findById(offer.lotId);
    if (!lot) {
      throw new NotFoundException('Lot not found');
    }
    if (lot.status !== LotStatus.ACTIVE) {
      throw new ConflictException({
        code: OFFER_ERROR_CODES.LOT_NOT_ACTIVE,
        message: 'Offers can only be accepted on active lots',
      });
    }
    if (lot.availableQuantity < offer.quantity) {
      throw new ConflictException({
        code: OFFER_ERROR_CODES.STALE_QUANTITY,
        message: `Only ${lot.availableQuantity} of the offered ${offer.quantity} remain available`,
      });
    }

    const now = new Date();
    const accepted = await this.prisma.$transaction(async (tx) => {
      const updated = await this.transition(offer, OfferStatus.ACCEPTED, now, tx);
      await this.invalidateSiblings(offer.lotId, offer.buyerId, offer.id, now, tx);
      if (offer.conversationId !== null) {
        await this.postActionMessage(offer.conversationId, sellerId, offerAcceptedActionBody(), tx);
      }
      return updated;
    });
    return toOfferResponse({ ...accepted, lot: lotSummaryOf(lot) }, 'seller');
  }

  /**
   * POST /offers/:id/reject — the seller declines: PENDING → REJECTED (+ the
   * ACTION message «پیشنهاد رد شد» into the tied thread, atomic). Same role
   * chain and lazy expiry as accept, minus the lot checks (declining needs
   * no lot state).
   */
  async reject(sellerId: string, offerId: string): Promise<OfferResponseDto> {
    const user = await this.requireUser(sellerId);
    this.assertSellerHat(user);

    const offer = await this.repository.findById(offerId);
    if (!offer) {
      throw new NotFoundException('Offer not found');
    }
    if (offer.sellerId !== sellerId) {
      throw new ForbiddenException({
        code: OFFER_ERROR_CODES.OFFER_NOT_SELLER,
        message: 'Only the seller of this offer’s lot can reject it',
      });
    }
    await this.expireIfDue(offer);

    const lot = await this.lots.findById(offer.lotId);
    if (!lot) {
      throw new NotFoundException('Lot not found');
    }
    const now = new Date();
    const rejected = await this.prisma.$transaction(async (tx) => {
      const updated = await this.transition(offer, OfferStatus.REJECTED, now, tx);
      if (offer.conversationId !== null) {
        await this.postActionMessage(offer.conversationId, sellerId, offerRejectedActionBody(), tx);
      }
      return updated;
    });
    // NTF hook point (offer.rejected) — realized P1.
    return toOfferResponse({ ...rejected, lot: lotSummaryOf(lot) }, 'seller');
  }

  /**
   * POST /offers/:id/cancel — the BUYER withdraws their own offer: PENDING →
   * CANCELLED, no ACTION message (withdrawing is silent by design — the
   * counterpart never saw a promise; documented decision). Ownership is the
   * gate (403 OFFER_NOT_BUYER) — no hat re-check: the buyer hat was required
   * at creation, and a role revoked later must not strand the user's own
   * negotiation record. Lazy expiry first: an expired offer is flipped
   * EXPIRED (409 OFFER_EXPIRED) — cancelling something the deadline already
   * killed would misreport the history.
   */
  async cancel(buyerId: string, offerId: string): Promise<OfferResponseDto> {
    await this.requireUser(buyerId);

    const offer = await this.repository.findById(offerId);
    if (!offer) {
      throw new NotFoundException('Offer not found');
    }
    if (offer.buyerId !== buyerId) {
      throw new ForbiddenException({
        code: OFFER_ERROR_CODES.OFFER_NOT_BUYER,
        message: 'Only the buyer who made this offer can cancel it',
      });
    }
    await this.expireIfDue(offer);

    const lot = await this.lots.findById(offer.lotId);
    if (!lot) {
      throw new NotFoundException('Lot not found');
    }
    const cancelled = await this.transition(offer, OfferStatus.CANCELLED, new Date());
    return toOfferResponse({ ...cancelled, lot: lotSummaryOf(lot) }, 'buyer');
  }

  /**
   * GET /offers?role=buyer|seller&status=&page=&limit= — the role-aware
   * list. `role=buyer` scopes to offers the caller MADE; `role=seller` to
   * offers on the caller's LOTS (the denormalized sellerId column — no join).
   * `myRole` in every item mirrors the requested role, newest first.
   */
  async listMine(userId: string, query: OfferListQueryDto): Promise<Paginated<OfferResponseDto>> {
    await this.requireUser(userId);
    const { items, total, page, limit } =
      query.role === 'buyer'
        ? await this.repository.findForBuyer(userId, query)
        : await this.repository.findForSeller(userId, query);
    return { items: items.map((row) => toOfferResponse(row, query.role)), total, page, limit };
  }

  /**
   * GET /lots/:lotId/offers — the seller's negotiation history for ONE lot:
   * SELLER hat (403 SELLER_REQUIRED), then a single owner-scoped read —
   * findBySellerAndId answers 404 for unknown AND foreign lots uniformly (no
   * existence oracle for unguessable lot ids; the established convention).
   * Newest first, every status (the full history, `myRole` = seller).
   */
  async listForLot(
    sellerId: string,
    lotId: string,
    query: LotOffersQueryDto,
  ): Promise<Paginated<OfferResponseDto>> {
    const user = await this.requireUser(sellerId);
    this.assertSellerHat(user);

    const lot = await this.lots.findBySellerAndId(sellerId, lotId);
    if (!lot) {
      throw new NotFoundException('Lot not found');
    }
    const { items, total, page, limit } = await this.repository.findForLot(lot.id, query);
    return { items: items.map((row) => toOfferResponse(row, 'seller')), total, page, limit };
  }

  // --- OFR-002 helpers (order documented per method) ---

  /**
   * Authenticated AND the user row still exists (401 when the token user is
   * gone — the same rule every service applies behind the global guard).
   */
  private async requireUser(userId: string): Promise<User> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }
    return user;
  }

  /** 403 + BUYER_REQUIRED without the BUYER hat (create — mirrors CHT-001). */
  private assertBuyerHat(user: User): void {
    if (!user.accountRoles.includes(AccountRole.BUYER)) {
      throw new ForbiddenException({
        code: OFFER_ERROR_CODES.BUYER_REQUIRED,
        message: 'Only buyer accounts can make offers',
      });
    }
  }

  /** 403 + SELLER_REQUIRED without the SELLER hat (the seller-side actions). */
  private assertSellerHat(user: User): void {
    if (!user.accountRoles.includes(AccountRole.SELLER)) {
      throw new ForbiddenException({
        code: OFFER_ERROR_CODES.SELLER_REQUIRED,
        message: 'Only seller accounts can act on offers',
      });
    }
  }

  /**
   * Lazy expiry (documented on the class doc): a PENDING offer past
   * `expiresAt` is flipped to EXPIRED — persisted, inside no transaction of
   * its own (the flip is honest even if the caller's action then fails; the
   * row WAS expired) — and the caller answers 409 OFFER_EXPIRED. Strict `<`:
   * an offer exactly at its deadline is still live.
   */
  private async expireIfDue(offer: Offer, now: Date = new Date()): Promise<void> {
    if (offer.status === OfferStatus.PENDING && offer.expiresAt.getTime() < now.getTime()) {
      await this.transition(offer, OfferStatus.EXPIRED, now);
      throw new ConflictException({
        code: OFFER_ERROR_CODES.OFFER_EXPIRED,
        message: 'This offer has expired',
      });
    }
  }

  /**
   * The ACTION message half of the offer transactions — mirrors CHT-003's
   * send lockstep exactly: the message row (type ACTION — TEXT-in-ACTION:
   * body is the fa template, sender = the acting party; no structured
   * payloads until feature #19) + the conversation's lastMessageAt /
   * lastMessagePreview + the COUNTERPART's unread increment (buyer speaks →
   * sellerUnreadCount+1, seller speaks → buyerUnreadCount+1). Runs inside
   * the CALLER's transaction (tx required) so the offer write and its thread
   * announcement commit or roll back atomically.
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
      // fail the offer transaction for the message's sake.
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
}
