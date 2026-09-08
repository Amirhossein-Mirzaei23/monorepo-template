import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountRole,
  LiquidationReason,
  LotCondition,
  LotStatus,
  MessageType,
  OfferStatus,
  PricingType,
  type User,
} from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';
import { FakePrisma } from '../../../test/fakes/fake-prisma';
import { ConversationsRepository } from '../../conversations/conversations.repository';
import { truncatePreview } from '../../conversations/conversations.constants';
import { LotsRepository } from '../../lots/lots.repository';
import { UsersRepository } from '../../users/users.repository';
import { OffersRepository } from '../offers.repository';
import {
  OFFER_EXPIRY_DAYS,
  OFFER_ERROR_CODES,
  offerAcceptedActionBody,
  offerActionMessageBody,
  offerRejectedActionBody,
} from '../offers.constants';
import { OffersService, validateOfferInput, type OfferableLot } from '../offers.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-09-05T10:00:00.000Z');
const EXPIRY_MS = OFFER_EXPIRY_DAYS * DAY_MS;

const BUYER_ID = 'buyer-1';
const OTHER_BUYER_ID = 'buyer-2';

/** The ACTIVE lot slice validateOfferInput reads (the matrix works without the fake). */
const activeLot: OfferableLot = {
  status: LotStatus.ACTIVE,
  minOrderQuantity: 10,
  availableQuantity: 40,
};

/** Grabs a synchronous throw, typed for the HttpException body asserts. */
function throwOf(fn: () => unknown): HttpException {
  try {
    fn();
  } catch (error) {
    return error as HttpException;
  }
  throw new Error('expected the call to throw');
}

/** Grabs a rejected promise, typed for the HttpException body asserts. */
async function rejectsOf(run: () => Promise<unknown>): Promise<HttpException> {
  try {
    await run();
  } catch (error) {
    return error as HttpException;
  }
  throw new Error('expected the call to reject');
}

function errorCode(error: unknown): string | undefined {
  return ((error as HttpException).getResponse() as { code?: string }).code;
}

describe('validateOfferInput (pure validation matrix, OFR-001 card)', () => {
  const base = { quantity: 10, unitPrice: 100_000 };

  it('derives totalPrice = unitPrice × quantity and stamps +72 h expiry', () => {
    const validated = validateOfferInput({ ...base, note: ' لطفاً تا آخر هفته ' }, activeLot, NOW);
    expect(validated).toEqual({
      quantity: 10,
      unitPrice: 100_000,
      totalPrice: 1_000_000,
      note: 'لطفاً تا آخر هفته',
      expiresAt: new Date(NOW.getTime() + EXPIRY_MS),
    });
  });

  it.each([
    [0, 'below'],
    [-1, 'negative'],
    [0.5, 'non-integer'],
    [2_000_000_001, 'above the 2B ceiling'],
    [Number.NaN, 'NaN'],
  ])('rejects a unitPrice of %p (%s)', (unitPrice) => {
    const thrown = throwOf(() => validateOfferInput({ ...base, unitPrice }, activeLot, NOW));
    expect(errorCode(thrown)).toBe(OFFER_ERROR_CODES.PRICE_OUT_OF_RANGE);
    expect(thrown).toBeInstanceOf(BadRequestException);
  });

  it('accepts the price bounds 1 and 2,000,000,000 Toman', () => {
    expect(validateOfferInput({ ...base, unitPrice: 1 }, activeLot, NOW).unitPrice).toBe(1);
    // The 2B ceiling needs quantity 1 (any more would breach the derived
    // totalPrice cap) — so this lot's minOrder must allow it.
    expect(
      validateOfferInput(
        { quantity: 1, unitPrice: 2_000_000_000 },
        { ...activeLot, minOrderQuantity: 1 },
        NOW,
      ).totalPrice,
    ).toBe(2_000_000_000);
  });

  it('rejects when the DERIVED totalPrice would exceed the money ceiling', () => {
    // unitPrice is legal, quantity is legal on this lot — the product is not.
    const thrown = throwOf(() =>
      validateOfferInput({ quantity: 40, unitPrice: 2_000_000_000 }, activeLot, NOW),
    );
    expect(errorCode(thrown)).toBe(OFFER_ERROR_CODES.PRICE_OUT_OF_RANGE);
  });

  it.each([
    ['a'.repeat(500), false, 'exactly 500 passes'],
    ['a'.repeat(501), true, '501 fails'],
    ['ژ'.repeat(500), false, '500 fa code points pass'],
    ['ژ'.repeat(501), true, '501 fa code points fail'],
  ])('note length: %s (%s — %s)', (note, shouldThrow) => {
    const run = () => validateOfferInput({ ...base, note }, activeLot, NOW);
    if (shouldThrow) {
      expect(errorCode(throwOf(run))).toBe(OFFER_ERROR_CODES.NOTE_TOO_LONG);
    } else {
      expect(() => run()).not.toThrow();
    }
  });

  it('stores a whitespace-only note as null (no empty-string rows)', () => {
    expect(validateOfferInput({ ...base, note: '   ' }, activeLot, NOW).note).toBeNull();
    expect(validateOfferInput({ ...base }, activeLot, NOW).note).toBeNull();
  });

  it.each([
    [LotStatus.DRAFT],
    [LotStatus.PENDING_REVIEW],
    [LotStatus.PAUSED],
    [LotStatus.REJECTED],
    [LotStatus.EXPIRED],
    [LotStatus.SOLD],
    [LotStatus.REMOVED],
  ])('rejects offers on a %s lot (only ACTIVE is offerable)', (status) => {
    const thrown = throwOf(() => validateOfferInput(base, { ...activeLot, status }, NOW));
    expect(errorCode(thrown)).toBe(OFFER_ERROR_CODES.LOT_NOT_ACTIVE);
    expect(thrown).toBeInstanceOf(ConflictException);
  });

  it.each([
    [9, 'below minOrder'],
    [41, 'above available'],
    [0, 'zero'],
    [-5, 'negative'],
    [10.5, 'non-integer'],
  ])('rejects a quantity of %p (%s)', (quantity) => {
    const thrown = throwOf(() => validateOfferInput({ ...base, quantity }, activeLot, NOW));
    expect(errorCode(thrown)).toBe(OFFER_ERROR_CODES.QUANTITY_OUT_OF_RANGE);
    expect(thrown).toBeInstanceOf(ConflictException);
  });

  it('accepts the quantity bounds minOrder and availableQuantity exactly', () => {
    expect(validateOfferInput({ ...base, quantity: 10 }, activeLot, NOW).quantity).toBe(10);
    expect(validateOfferInput({ ...base, quantity: 40 }, activeLot, NOW).quantity).toBe(40);
  });
});

describe('OffersService (OFR-001 — chain semantics + sibling invalidation)', () => {
  let fake: FakePrisma;
  let service: OffersService;
  let repository: OffersRepository;

  const seedActiveLot = () =>
    fake.seedLot({
      sellerId: 'seller-1',
      categoryId: 'cat-1',
      title: 'عمده پیراهن مردانه — ۵۰ عدد',
      quantity: 50,
      availableQuantity: 40,
      minOrderQuantity: 10,
      pricingType: PricingType.NEGOTIABLE,
      totalPrice: 112_500_000,
      unitPrice: 2_250_000,
      condition: LotCondition.GRADE_A,
      liquidationReason: LiquidationReason.OVERSTOCK,
      province: 'tehran',
      city: 'tehran',
      status: LotStatus.ACTIVE,
      expiresAt: new Date(Date.now() + 30 * DAY_MS),
    });

  const seedPendingOffer = (
    lotId: string,
    overrides: Partial<Parameters<FakePrisma['seedOffer']>[0]> = {},
  ) =>
    fake.seedOffer({
      lotId,
      buyerId: BUYER_ID,
      sellerId: 'seller-1',
      quantity: 10,
      unitPrice: 2_000_000,
      totalPrice: 20_000_000,
      expiresAt: new Date(NOW.getTime() + EXPIRY_MS),
      ...overrides,
    });

  beforeEach(() => {
    fake = new FakePrisma();
    repository = new OffersRepository(fake as unknown as PrismaService);
    const lots = new LotsRepository(fake as unknown as PrismaService);
    const users = new UsersRepository(fake as unknown as PrismaService);
    const conversations = new ConversationsRepository(fake as unknown as PrismaService);
    service = new OffersService(
      repository,
      lots,
      users,
      conversations,
      fake as unknown as PrismaService,
    );
  });

  describe('createCounter — counter creates a NEW LINKED offer', () => {
    it('creates a PENDING child (parentId → parent) and flips the parent to COUNTERED', async () => {
      const lot = seedActiveLot();
      const parent = seedPendingOffer(lot.id);
      const now = new Date();

      const { parent: countered, child } = await service.createCounter(
        parent,
        { quantity: 12, unitPrice: 2_100_000, note: 'قیمت جدید' },
        now,
      );

      // Parent: decision applied, terms untouched.
      expect(countered.id).toBe(parent.id);
      expect(countered.status).toBe(OfferStatus.COUNTERED);
      expect(countered.decidedAt).toEqual(now);
      expect(countered.unitPrice).toBe(2_000_000); // history is immutable

      // Child: a NEW PENDING offer linked back to the parent.
      expect(child.id).not.toBe(parent.id);
      expect(child.parentId).toBe(parent.id);
      expect(child.status).toBe(OfferStatus.PENDING);
      expect(child.decidedAt).toBeNull();
      expect(child.lotId).toBe(lot.id);
      expect(child.buyerId).toBe(parent.buyerId);
      expect(child.sellerId).toBe(parent.sellerId);
      expect(child.quantity).toBe(12);
      expect(child.unitPrice).toBe(2_100_000);
      expect(child.totalPrice).toBe(25_200_000); // derived on write
      expect(child.note).toBe('قیمت جدید');
      // The child carries its OWN fresh 72 h window.
      expect(child.expiresAt.getTime()).toBe(now.getTime() + EXPIRY_MS);
    });

    it('inherits the conversation link from the parent (the chain stays in-thread)', async () => {
      const lot = seedActiveLot();
      const conversation = fake.seedConversation({
        lotId: lot.id,
        buyerId: BUYER_ID,
        sellerId: 'seller-1',
        lastMessageAt: NOW,
      });
      const parent = seedPendingOffer(lot.id, { conversationId: conversation.id });

      const { child } = await service.createCounter(
        parent,
        { quantity: 10, unitPrice: 2_100_000 },
        NOW,
      );

      expect(child.conversationId).toBe(conversation.id);
    });

    it('rejects countering a non-PENDING offer (409 ILLEGAL_TRANSITION, no child written)', async () => {
      const lot = seedActiveLot();
      const parent = seedPendingOffer(lot.id, { status: OfferStatus.ACCEPTED });

      const thrown = await service
        .createCounter(parent, { quantity: 10, unitPrice: 2_100_000 }, NOW)
        .then(
          () => {
            throw new Error('expected the counter to be rejected');
          },
          (error: HttpException) => error,
        );

      expect(thrown).toBeInstanceOf(ConflictException);
      expect(errorCode(thrown)).toBe(OFFER_ERROR_CODES.ILLEGAL_TRANSITION);
      // No child offer was written: the parent's chain still holds only itself.
      expect(await repository.findChain(parent.id)).toHaveLength(1);
    });

    it('runs the counter input through validateOfferInput (bad price → 400, parent untouched)', async () => {
      const lot = seedActiveLot();
      const parent = seedPendingOffer(lot.id);

      const thrown = await service.createCounter(parent, { quantity: 10, unitPrice: 0 }, NOW).then(
        () => {
          throw new Error('expected the counter to be rejected');
        },
        (error: HttpException) => error,
      );

      expect(thrown).toBeInstanceOf(BadRequestException);
      expect(errorCode(thrown)).toBe(OFFER_ERROR_CODES.PRICE_OUT_OF_RANGE);
      const reloaded = await repository.findById(parent.id);
      expect(reloaded?.status).toBe(OfferStatus.PENDING);
      expect(reloaded?.decidedAt).toBeNull();
    });

    it('validates the counter quantity against the CURRENT lot availability', async () => {
      const lot = seedActiveLot(); // available 40, minOrder 10
      const parent = seedPendingOffer(lot.id);

      const thrown = await service
        .createCounter(parent, { quantity: 41, unitPrice: 2_100_000 }, NOW)
        .then(
          () => {
            throw new Error('expected the counter to be rejected');
          },
          (error: HttpException) => error,
        );

      expect(errorCode(thrown)).toBe(OFFER_ERROR_CODES.QUANTITY_OUT_OF_RANGE);
    });
  });

  describe("invalidateSiblings — accepting one offer rejects the buyer's other pending ones", () => {
    it('rejects same-lot same-buyer PENDING siblings only, and is total on repeat', async () => {
      const lot = seedActiveLot();
      const otherLot = seedActiveLot();
      const accepted = seedPendingOffer(lot.id);
      const siblingA = seedPendingOffer(lot.id);
      const siblingB = seedPendingOffer(lot.id);
      const otherBuyer = seedPendingOffer(lot.id, { buyerId: OTHER_BUYER_ID });
      const alreadyRejected = seedPendingOffer(lot.id, {
        status: OfferStatus.REJECTED,
        decidedAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      const otherLotPending = seedPendingOffer(otherLot.id);
      const now = new Date();

      const rejectedCount = await service.invalidateSiblings(lot.id, BUYER_ID, accepted.id, now);

      expect(rejectedCount).toBe(2); // siblingA + siblingB
      const reload = (id: string) => repository.findById(id);
      expect((await reload(siblingA.id))?.status).toBe(OfferStatus.REJECTED);
      expect((await reload(siblingA.id))?.decidedAt).toEqual(now);
      expect((await reload(siblingB.id))?.status).toBe(OfferStatus.REJECTED);
      // The accepted offer itself is untouched.
      expect((await reload(accepted.id))?.status).toBe(OfferStatus.PENDING);
      // Other buyers, other lots, and already-decided rows are untouched.
      expect((await reload(otherBuyer.id))?.status).toBe(OfferStatus.PENDING);
      expect((await reload(alreadyRejected.id))?.decidedAt).toEqual(
        new Date('2026-01-01T00:00:00.000Z'),
      );
      expect((await reload(otherLotPending.id))?.status).toBe(OfferStatus.PENDING);

      // Idempotent: a second pass finds no live siblings.
      expect(await service.invalidateSiblings(lot.id, BUYER_ID, accepted.id, now)).toBe(0);
    });
  });

  describe('transition — the single status-write gate', () => {
    it('applies a legal move and stamps decidedAt', async () => {
      const lot = seedActiveLot();
      const offer = seedPendingOffer(lot.id);
      const now = new Date();

      const decided = await service.transition(offer, OfferStatus.ACCEPTED, now);

      expect(decided.status).toBe(OfferStatus.ACCEPTED);
      expect(decided.decidedAt).toEqual(now);
    });

    it('refuses an illegal move and leaves the row untouched', async () => {
      const lot = seedActiveLot();
      const offer = seedPendingOffer(lot.id);

      const thrown = await service.transition(offer, OfferStatus.PENDING, NOW).then(
        () => {
          throw new Error('expected the transition to be rejected');
        },
        (error: HttpException) => error,
      );

      expect(thrown).toBeInstanceOf(ConflictException);
      expect(errorCode(thrown)).toBe(OFFER_ERROR_CODES.ILLEGAL_TRANSITION);
      expect((await repository.findById(offer.id))?.status).toBe(OfferStatus.PENDING);
    });

    it('refuses moves out of a terminal status', async () => {
      const lot = seedActiveLot();
      const offer = seedPendingOffer(lot.id, { status: OfferStatus.EXPIRED });

      const thrown = await service.transition(offer, OfferStatus.REJECTED, NOW).then(
        () => {
          throw new Error('expected the transition to be rejected');
        },
        (error: HttpException) => error,
      );

      expect(errorCode(thrown)).toBe(OFFER_ERROR_CODES.ILLEGAL_TRANSITION);
    });
  });

  describe('findChain — the counter chain walked oldest-first', () => {
    it('returns root → child for a countered offer', async () => {
      const lot = seedActiveLot();
      const root = seedPendingOffer(lot.id);
      const { child } = await service.createCounter(
        root,
        { quantity: 11, unitPrice: 2_050_000 },
        NOW,
      );

      expect((await service.findChain(child.id)).map((offer) => offer.id)).toEqual([
        root.id,
        child.id,
      ]);
      expect((await service.findChain(root.id)).map((offer) => offer.id)).toEqual([root.id]);
    });

    it('returns [] for an unknown offer id', async () => {
      expect(await service.findChain('missing-id')).toEqual([]);
    });
  });
});

describe('OffersService API (OFR-002 — role gates, expiry, ACTION messages, listings)', () => {
  let fake: FakePrisma;
  let service: OffersService;
  let repository: OffersRepository;
  let buyer: User;
  let seller: User;
  let otherBuyer: User;
  let otherSeller: User;
  let lot: ReturnType<FakePrisma['seedLot']>;

  /** A conversation tied to the default lot + default buyer/seller. */
  const seedThread = () =>
    fake.seedConversation({
      lotId: lot.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      lastMessageAt: new Date('2026-01-01T00:00:00.000Z'),
    });

  const seedPendingOffer = (overrides: Partial<Parameters<FakePrisma['seedOffer']>[0]> = {}) =>
    fake.seedOffer({
      lotId: lot.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      quantity: 10,
      unitPrice: 2_000_000,
      totalPrice: 20_000_000,
      expiresAt: new Date(Date.now() + EXPIRY_MS),
      ...overrides,
    });

  const messagesIn = (conversationId: string) =>
    fake.message.findMany({ where: { conversationId } });

  const conversationRow = (conversationId: string) =>
    fake.conversation.findUnique({ where: { id: conversationId } });

  beforeEach(() => {
    fake = new FakePrisma();
    const prisma = fake as unknown as PrismaService;
    repository = new OffersRepository(prisma);
    service = new OffersService(
      repository,
      new LotsRepository(prisma),
      new UsersRepository(prisma),
      new ConversationsRepository(prisma),
      prisma,
    );
    buyer = fake.seedUser({
      phone: '09120000001',
      name: 'Buyer',
      accountRoles: [AccountRole.BUYER],
    });
    seller = fake.seedUser({
      phone: '09120000002',
      name: 'Seller',
      accountRoles: [AccountRole.SELLER],
    });
    otherBuyer = fake.seedUser({
      phone: '09120000003',
      name: 'Other buyer',
      accountRoles: [AccountRole.BUYER],
    });
    otherSeller = fake.seedUser({
      phone: '09120000004',
      name: 'Other seller',
      accountRoles: [AccountRole.SELLER],
    });
    lot = fake.seedLot({
      sellerId: seller.id,
      categoryId: 'cat-1',
      title: 'عمده پیراهن مردانه — ۵۰ عدد',
      quantity: 50,
      availableQuantity: 40,
      minOrderQuantity: 10,
      pricingType: PricingType.NEGOTIABLE,
      totalPrice: 112_500_000,
      unitPrice: 2_250_000,
      condition: LotCondition.GRADE_A,
      liquidationReason: LiquidationReason.OVERSTOCK,
      province: 'tehran',
      city: 'tehran',
      status: LotStatus.ACTIVE,
      expiresAt: new Date(Date.now() + 30 * DAY_MS),
    });
  });

  describe('create — POST /offers (buyer only, ACTIVE lots only)', () => {
    it('creates a PENDING root offer: derived total, +72 h expiry, allowlisted payload', async () => {
      const before = Date.now();
      const response = await service.create(buyer.id, {
        lotId: lot.id,
        quantity: 10,
        unitPrice: 2_000_000,
        note: '  لطفاً تا آخر هفته  ',
      });

      expect(response.status).toBe(OfferStatus.PENDING);
      expect(response.myRole).toBe('buyer');
      expect(response.totalPrice).toBe(20_000_000);
      expect(response.note).toBe('لطفاً تا آخر هفته');
      expect(response.decidedAt).toBeNull();
      expect(response.expiresAt.getTime()).toBeGreaterThanOrEqual(before + EXPIRY_MS);
      // The lot summary block + the exact allowlist key set (nothing leaks).
      expect(response.lot).toEqual({ code: lot.code, title: lot.title, unitPrice: lot.unitPrice });
      expect(Object.keys(response).sort()).toEqual(
        [
          'createdAt',
          'decidedAt',
          'expiresAt',
          'id',
          'lot',
          'myRole',
          'note',
          'quantity',
          'status',
          'totalPrice',
          'unitPrice',
        ].sort(),
      );
    });

    it('gates on the BUYER hat BEFORE lot probing (403 BUYER_REQUIRED)', async () => {
      const hatless = fake.seedUser({ phone: '09120000005', name: 'Hatless' });
      const thrown = await rejectsOf(() =>
        service.create(hatless.id, { lotId: 'no-such-lot', quantity: 10, unitPrice: 2_000_000 }),
      );
      expect(thrown).toBeInstanceOf(ForbiddenException);
      expect(errorCode(thrown)).toBe(OFFER_ERROR_CODES.BUYER_REQUIRED);
    });

    it('404s an unknown lot', async () => {
      const thrown = await rejectsOf(() =>
        service.create(buyer.id, { lotId: 'no-such-lot', quantity: 10, unitPrice: 2_000_000 }),
      );
      expect(thrown).toBeInstanceOf(NotFoundException);
    });

    it('rejects the lot’s own seller (dual hat) with 403 SELF_OFFER', async () => {
      const dualHat = fake.seedUser({
        phone: '09120000006',
        name: 'Dual',
        accountRoles: [AccountRole.SELLER, AccountRole.BUYER],
      });
      const ownLot = fake.seedLot({
        sellerId: dualHat.id,
        categoryId: 'cat-1',
        title: 'عمده کفش ورزشی — ۲۰ جفت',
        quantity: 20,
        availableQuantity: 20,
        minOrderQuantity: 5,
        pricingType: PricingType.NEGOTIABLE,
        totalPrice: 60_000_000,
        unitPrice: 3_000_000,
        condition: LotCondition.GRADE_B,
        liquidationReason: LiquidationReason.OVERSTOCK,
        province: 'tehran',
        city: 'tehran',
        status: LotStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 30 * DAY_MS),
      });
      const thrown = await rejectsOf(() =>
        service.create(dualHat.id, { lotId: ownLot.id, quantity: 5, unitPrice: 3_000_000 }),
      );
      expect(errorCode(thrown)).toBe(OFFER_ERROR_CODES.SELF_OFFER);
      expect(dualHat.accountRoles).toContain(AccountRole.BUYER); // hat was not the gate
    });

    it('rejects a foreign lot’s conversation tie with 400 CONVERSATION_LOT_MISMATCH', async () => {
      const otherLot = fake.seedLot({
        sellerId: seller.id,
        categoryId: 'cat-1',
        title: 'عمده کفش ورزشی — ۲۰ جفت',
        quantity: 20,
        availableQuantity: 20,
        minOrderQuantity: 5,
        pricingType: PricingType.NEGOTIABLE,
        totalPrice: 60_000_000,
        unitPrice: 3_000_000,
        condition: LotCondition.GRADE_B,
        liquidationReason: LiquidationReason.OVERSTOCK,
        province: 'tehran',
        city: 'tehran',
        status: LotStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 30 * DAY_MS),
      });
      const foreignThread = fake.seedConversation({
        lotId: otherLot.id,
        buyerId: otherBuyer.id,
        sellerId: seller.id,
        lastMessageAt: new Date(),
      });
      const thrown = await rejectsOf(() =>
        service.create(otherBuyer.id, {
          lotId: lot.id,
          quantity: 10,
          unitPrice: 2_000_000,
          conversationId: foreignThread.id,
        }),
      );
      expect(thrown).toBeInstanceOf(BadRequestException);
      expect(errorCode(thrown)).toBe(OFFER_ERROR_CODES.CONVERSATION_LOT_MISMATCH);
    });

    it('answers an unknown AND a foreign conversationId uniformly with 403 (no oracle)', async () => {
      const foreignThread = seedThread();
      for (const conversationId of ['no-such-conversation', foreignThread.id]) {
        const thrown = await rejectsOf(() =>
          service.create(otherBuyer.id, {
            lotId: lot.id,
            quantity: 10,
            unitPrice: 2_000_000,
            conversationId,
          }),
        );
        expect(errorCode(thrown)).toBe(OFFER_ERROR_CODES.CONVERSATION_NOT_YOURS);
      }
    });

    it('posts the ACTION message + conversation lockstep in the same transaction when tied', async () => {
      const thread = seedThread();
      const response = await service.create(buyer.id, {
        lotId: lot.id,
        quantity: 40, // the lot's full availability
        unitPrice: 300_000,
        conversationId: thread.id,
      });

      const messages = await messagesIn(thread.id);
      expect(messages).toHaveLength(1);
      const action = messages[0]!;
      // TEXT-in-ACTION: the fa template body, the buyer as sender, no media.
      expect(action.type).toBe(MessageType.ACTION);
      expect(action.senderId).toBe(buyer.id);
      expect(action.body).toBe(
        offerActionMessageBody(response.totalPrice, response.quantity, lot.unit),
      );
      expect(action.body).toContain('پیشنهاد');

      // The conversation lockstep (CHT-003 mirror): preview + activity stamp +
      // the COUNTERPART (seller) unread counter.
      const row = await conversationRow(thread.id);
      expect(row?.lastMessagePreview).toBe(truncatePreview(action.body!));
      expect(row?.lastMessageAt.getTime()).toBeGreaterThan(
        new Date('2026-01-01T00:00:00.000Z').getTime(),
      );
      expect(row?.sellerUnreadCount).toBe(1);
      expect(row?.buyerUnreadCount).toBe(0);
      expect(response.lot).toEqual({ code: lot.code, title: lot.title, unitPrice: lot.unitPrice });
    });

    it('skips the message entirely when not tied to a thread', async () => {
      const response = await service.create(buyer.id, {
        lotId: lot.id,
        quantity: 10,
        unitPrice: 2_000_000,
      });
      expect(response.lot).toBeDefined();
      expect(await messagesIn('any-thread')).toHaveLength(0);
    });
  });

  describe('counter — POST /offers/:id/counter (the lot’s seller)', () => {
    it('creates the child + flips the parent + posts the seller’s ACTION message atomically', async () => {
      const thread = seedThread();
      const parent = seedPendingOffer({ conversationId: thread.id });
      const before = Date.now();

      const child = await service.counter(seller.id, parent.id, {
        quantity: 12,
        unitPrice: 2_100_000,
      });

      expect(child.status).toBe(OfferStatus.PENDING);
      expect(child.myRole).toBe('seller');
      expect(child.expiresAt.getTime()).toBeGreaterThanOrEqual(before + EXPIRY_MS); // fresh 72 h
      // The chain link lives on the row (allowlisted OUT of the payload):
      const persistedChild = await repository.findById(child.id);
      expect(persistedChild?.parentId).toBe(parent.id);
      expect((await repository.findById(parent.id))?.status).toBe(OfferStatus.COUNTERED);

      const action = (await messagesIn(thread.id))[0]!;
      expect(action.type).toBe(MessageType.ACTION);
      expect(action.senderId).toBe(seller.id);
      expect(action.body).toBe(offerActionMessageBody(child.totalPrice, child.quantity, lot.unit));
      const row = await conversationRow(thread.id);
      expect(row?.buyerUnreadCount).toBe(1); // the seller spoke → the buyer's counter
      expect(row?.sellerUnreadCount).toBe(0);
    });

    it('gates: 403 SELLER_REQUIRED before probing for a buyer, 403 OFFER_NOT_SELLER for another seller', async () => {
      const parent = seedPendingOffer();
      const buyerThrown = await rejectsOf(() =>
        service.counter(buyer.id, 'no-such-offer', { quantity: 10, unitPrice: 2_000_000 }),
      );
      expect(errorCode(buyerThrown)).toBe(OFFER_ERROR_CODES.SELLER_REQUIRED);

      const foreignThrown = await rejectsOf(() =>
        service.counter(otherSeller.id, parent.id, { quantity: 10, unitPrice: 2_000_000 }),
      );
      expect(errorCode(foreignThrown)).toBe(OFFER_ERROR_CODES.OFFER_NOT_SELLER);
      expect((await repository.findById(parent.id))?.status).toBe(OfferStatus.PENDING);
    });

    it('lazily flips a past-due PENDING parent to EXPIRED, then answers 409 OFFER_EXPIRED (no child)', async () => {
      const parent = seedPendingOffer({ expiresAt: new Date(Date.now() - 1000) });

      const thrown = await rejectsOf(() =>
        service.counter(seller.id, parent.id, { quantity: 10, unitPrice: 2_000_000 }),
      );

      expect(errorCode(thrown)).toBe(OFFER_ERROR_CODES.OFFER_EXPIRED);
      const persisted = await repository.findById(parent.id);
      expect(persisted?.status).toBe(OfferStatus.EXPIRED); // the honest flip
      expect(persisted?.decidedAt).not.toBeNull();
      expect(await repository.findChain(parent.id)).toHaveLength(1); // no child written
    });

    it('answers ILLEGAL_TRANSITION for an already-flipped EXPIRED parent (the table owns it)', async () => {
      const parent = seedPendingOffer({
        status: OfferStatus.EXPIRED,
        decidedAt: new Date(),
      });
      const thrown = await rejectsOf(() =>
        service.counter(seller.id, parent.id, { quantity: 10, unitPrice: 2_000_000 }),
      );
      expect(errorCode(thrown)).toBe(OFFER_ERROR_CODES.ILLEGAL_TRANSITION);
    });

    it('revalidates the counter terms against the CURRENT lot (stale quantity → 409)', async () => {
      const parent = seedPendingOffer();
      fake.lot.update({
        where: { id: lot.id },
        data: { availableQuantity: 5 }, // the lot shrank since the parent was written
      });

      const thrown = await rejectsOf(() =>
        service.counter(seller.id, parent.id, { quantity: 10, unitPrice: 2_000_000 }),
      );
      expect(errorCode(thrown)).toBe(OFFER_ERROR_CODES.QUANTITY_OUT_OF_RANGE);
      expect((await repository.findById(parent.id))?.status).toBe(OfferStatus.PENDING);
    });
  });

  describe('accept — POST /offers/:id/accept (siblings auto-reject, DEAL-002 eligibility)', () => {
    it('accepts in a transaction: ACCEPTED + siblings REJECTED + «پیشنهاد پذیرفته شد» message', async () => {
      const thread = seedThread();
      const accepted = seedPendingOffer({ conversationId: thread.id });
      const siblingA = seedPendingOffer();
      const siblingB = seedPendingOffer();
      const otherBuyerOffer = seedPendingOffer({ buyerId: otherBuyer.id });

      const response = await service.accept(seller.id, accepted.id);

      expect(response.status).toBe(OfferStatus.ACCEPTED);
      expect(response.decidedAt).not.toBeNull();
      expect(response.myRole).toBe('seller');
      expect((await repository.findById(siblingA.id))?.status).toBe(OfferStatus.REJECTED);
      expect((await repository.findById(siblingB.id))?.status).toBe(OfferStatus.REJECTED);
      // Other buyers' offers on the same lot are NOT siblings — untouched.
      expect((await repository.findById(otherBuyerOffer.id))?.status).toBe(OfferStatus.PENDING);

      const action = (await messagesIn(thread.id))[0]!;
      expect(action.body).toBe(offerAcceptedActionBody());
      expect(action.senderId).toBe(seller.id);
      expect((await conversationRow(thread.id))?.buyerUnreadCount).toBe(1);
    });

    it('409s OFFER_EXPIRED with the lazy flip persisted when past due', async () => {
      const offer = seedPendingOffer({ expiresAt: new Date(Date.now() - 1000) });
      const thrown = await rejectsOf(() => service.accept(seller.id, offer.id));
      expect(errorCode(thrown)).toBe(OFFER_ERROR_CODES.OFFER_EXPIRED);
      expect((await repository.findById(offer.id))?.status).toBe(OfferStatus.EXPIRED);
    });

    it('409s LOT_NOT_ACTIVE when the lot is no longer offerable', async () => {
      const offer = seedPendingOffer();
      fake.lot.update({ where: { id: lot.id }, data: { status: LotStatus.PAUSED } });
      const thrown = await rejectsOf(() => service.accept(seller.id, offer.id));
      expect(errorCode(thrown)).toBe(OFFER_ERROR_CODES.LOT_NOT_ACTIVE);
      expect((await repository.findById(offer.id))?.status).toBe(OfferStatus.PENDING);
    });

    it('409s STALE_QUANTITY when current availability no longer covers the offer', async () => {
      const offer = seedPendingOffer({ quantity: 10 });
      fake.lot.update({ where: { id: lot.id }, data: { availableQuantity: 9 } });
      const thrown = await rejectsOf(() => service.accept(seller.id, offer.id));
      expect(errorCode(thrown)).toBe(OFFER_ERROR_CODES.STALE_QUANTITY);
      expect((await repository.findById(offer.id))?.status).toBe(OfferStatus.PENDING);
    });

    it('role gates: buyer → 403 SELLER_REQUIRED, another seller → 403 OFFER_NOT_SELLER', async () => {
      const offer = seedPendingOffer();
      expect(errorCode(await rejectsOf(() => service.accept(buyer.id, offer.id)))).toBe(
        OFFER_ERROR_CODES.SELLER_REQUIRED,
      );
      expect(errorCode(await rejectsOf(() => service.accept(otherSeller.id, offer.id)))).toBe(
        OFFER_ERROR_CODES.OFFER_NOT_SELLER,
      );
      expect((await repository.findById(offer.id))?.status).toBe(OfferStatus.PENDING);
    });
  });

  describe('reject — POST /offers/:id/reject (the lot’s seller)', () => {
    it('rejects a PENDING offer and posts «پیشنهاد رد شد» into the tied thread', async () => {
      const thread = seedThread();
      const offer = seedPendingOffer({ conversationId: thread.id });

      const response = await service.reject(seller.id, offer.id);

      expect(response.status).toBe(OfferStatus.REJECTED);
      const action = (await messagesIn(thread.id))[0]!;
      expect(action.body).toBe(offerRejectedActionBody());
    });

    it('gates out a buyer (403 SELLER_REQUIRED)', async () => {
      const offer = seedPendingOffer();
      const thrown = await rejectsOf(() => service.reject(buyer.id, offer.id));
      expect(errorCode(thrown)).toBe(OFFER_ERROR_CODES.SELLER_REQUIRED);
    });
  });

  describe('cancel — POST /offers/:id/cancel (the buyer who made it, silent)', () => {
    it('cancels the own PENDING offer with NO ACTION message', async () => {
      const thread = seedThread();
      const offer = seedPendingOffer({ conversationId: thread.id });

      const response = await service.cancel(buyer.id, offer.id);

      expect(response.status).toBe(OfferStatus.CANCELLED);
      expect(response.myRole).toBe('buyer');
      expect(await messagesIn(thread.id)).toHaveLength(0); // silent by design
    });

    it('gates: 403 OFFER_NOT_BUYER for anyone but the own buyer (seller included)', async () => {
      const offer = seedPendingOffer();
      expect(errorCode(await rejectsOf(() => service.cancel(otherBuyer.id, offer.id)))).toBe(
        OFFER_ERROR_CODES.OFFER_NOT_BUYER,
      );
      expect(errorCode(await rejectsOf(() => service.cancel(seller.id, offer.id)))).toBe(
        OFFER_ERROR_CODES.OFFER_NOT_BUYER,
      );
    });

    it('lazy-expires a past-due offer instead of cancelling it (409 OFFER_EXPIRED)', async () => {
      const offer = seedPendingOffer({ expiresAt: new Date(Date.now() - 1000) });
      const thrown = await rejectsOf(() => service.cancel(buyer.id, offer.id));
      expect(errorCode(thrown)).toBe(OFFER_ERROR_CODES.OFFER_EXPIRED);
      expect((await repository.findById(offer.id))?.status).toBe(OfferStatus.EXPIRED);
    });
  });

  describe('listings — GET /offers (role-aware) + GET /lots/:lotId/offers', () => {
    it('role=buyer lists only the caller’s offers with myRole buyer (newest first)', async () => {
      const mine = seedPendingOffer();
      seedPendingOffer({ buyerId: otherBuyer.id }); // another buyer's — invisible

      const page = await service.listMine(buyer.id, { role: 'buyer', page: 1, limit: 20 });

      expect(page.total).toBe(1);
      expect(page.items.map((row) => row.id)).toEqual([mine.id]);
      expect(page.items[0]?.myRole).toBe('buyer');
      expect(page.items[0]?.lot).toEqual({
        code: lot.code,
        title: lot.title,
        unitPrice: lot.unitPrice,
      });
    });

    it('role=seller lists offers on my lots; status narrows the tab', async () => {
      const pending = seedPendingOffer();
      seedPendingOffer({ status: OfferStatus.ACCEPTED, decidedAt: new Date() });

      const all = await service.listMine(seller.id, { role: 'seller', page: 1, limit: 20 });
      expect(all.total).toBe(2);
      expect(all.items.every((row) => row.myRole === 'seller')).toBe(true);

      const onlyPending = await service.listMine(seller.id, {
        role: 'seller',
        status: OfferStatus.PENDING,
        page: 1,
        limit: 20,
      });
      expect(onlyPending.total).toBe(1);
      expect(onlyPending.items[0]?.id).toBe(pending.id);
    });

    it('listForLot returns the lot’s full history for its owner, 403/404 otherwise', async () => {
      // Explicit stamps: same-millisecond rows would fall to the id tiebreak.
      const first = seedPendingOffer({ createdAt: new Date('2026-09-01T10:00:00.000Z') });
      const second = seedPendingOffer({ createdAt: new Date('2026-09-02T10:00:00.000Z') });

      const page = await service.listForLot(seller.id, lot.id, { page: 1, limit: 20 });
      expect(page.total).toBe(2);
      expect(page.items.map((row) => row.id)).toEqual([second.id, first.id]); // newest first

      const buyerThrown = await rejectsOf(() =>
        service.listForLot(buyer.id, lot.id, { page: 1, limit: 20 }),
      );
      expect(errorCode(buyerThrown)).toBe(OFFER_ERROR_CODES.SELLER_REQUIRED);

      // Uniform 404: another seller's lot and an unknown id are the same answer.
      const foreignLot = fake.seedLot({
        sellerId: otherSeller.id,
        categoryId: 'cat-1',
        title: 'عمده کفش ورزشی — ۲۰ جفت',
        quantity: 20,
        availableQuantity: 20,
        minOrderQuantity: 5,
        pricingType: PricingType.NEGOTIABLE,
        totalPrice: 60_000_000,
        unitPrice: 3_000_000,
        condition: LotCondition.GRADE_B,
        liquidationReason: LiquidationReason.OVERSTOCK,
        province: 'tehran',
        city: 'tehran',
        status: LotStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 30 * DAY_MS),
      });
      expect(
        (
          await rejectsOf(() =>
            service.listForLot(seller.id, foreignLot.id, { page: 1, limit: 20 }),
          )
        ).getStatus(),
      ).toBe(404);
      expect(
        (
          await rejectsOf(() =>
            service.listForLot(seller.id, 'no-such-lot', { page: 1, limit: 20 }),
          )
        ).getStatus(),
      ).toBe(404);
    });
  });
});
