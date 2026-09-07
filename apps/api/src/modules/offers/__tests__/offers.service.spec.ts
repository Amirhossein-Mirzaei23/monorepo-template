import { BadRequestException, ConflictException, HttpException } from '@nestjs/common';
import {
  LiquidationReason,
  LotCondition,
  LotStatus,
  OfferStatus,
  PricingType,
} from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';
import { FakePrisma } from '../../../test/fakes/fake-prisma';
import { LotsRepository } from '../../lots/lots.repository';
import { OffersRepository } from '../offers.repository';
import { OFFER_EXPIRY_DAYS, OFFER_ERROR_CODES } from '../offers.constants';
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
    service = new OffersService(repository, lots, fake as unknown as PrismaService);
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
