import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountRole,
  DealStatus,
  DeliveryMethod,
  LiquidationReason,
  LotCondition,
  LotStatus,
  MessageType,
  OfferStatus,
  PaymentMethodRecorded,
  PricingType,
  type Prisma,
} from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';
import { FakePrisma } from '../../../test/fakes/fake-prisma';
import { ConversationsRepository } from '../../conversations/conversations.repository';
import { LotsRepository } from '../../lots/lots.repository';
import { OffersRepository } from '../../offers/offers.repository';
import { UsersRepository } from '../../users/users.repository';
import { DealsRepository } from '../deals.repository';
import {
  DEAL_ERROR_CODES,
  STAGE_TIMESTAMP_FIELDS,
  dealCreatedActionBody,
  type DealRole,
} from '../deals.constants';
import {
  DealsService,
  creationEvent,
  validateDealInput,
  type DealTermsInput,
} from '../deals.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-09-05T10:00:00.000Z');
const BUYER_ID = 'buyer-1';
const SELLER_ID = 'seller-1';

/** The lot slice validateDealInput reads (the pure matrix works without the fake). */
const baseLot = { id: 'lot-1', availableQuantity: 40 };

/** The agreeable base terms: 10 pieces × 1,000,000 Toman. */
const baseInput: DealTermsInput = {
  quantity: 10,
  unitPrice: 1_000_000,
  deliveryMethod: DeliveryMethod.SELLER_SHIPS,
  paymentMethod: PaymentMethodRecorded.CARD_TO_CARD,
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

describe('validateDealInput (pure validation matrix, DEAL-001 card)', () => {
  it('derives totalPrice = unitPrice × quantity and copies the terms snapshot', () => {
    const validated = validateDealInput(
      {
        ...baseInput,
        deliveryNote: ' بسته‌بندی کارتنی ',
        paymentTermsNote: ' ۳ قسط ',
      },
      baseLot,
    );
    expect(validated).toEqual({
      quantity: 10,
      unitPrice: 1_000_000,
      totalPrice: 10_000_000,
      deliveryMethod: DeliveryMethod.SELLER_SHIPS,
      deliveryNote: 'بسته‌بندی کارتنی',
      paymentMethod: PaymentMethodRecorded.CARD_TO_CARD,
      paymentTermsNote: '۳ قسط',
      commissionRate: 0,
    });
  });

  it('reserves commissionRate at the MVP constant (0)', () => {
    expect(validateDealInput(baseInput, baseLot).commissionRate).toBe(0);
  });

  it.each([
    [0, 'below'],
    [-1, 'negative'],
    [0.5, 'non-integer'],
    [2_000_000_001, 'above the 2B ceiling'],
    [Number.NaN, 'NaN'],
  ])('rejects a unitPrice of %p (%s)', (unitPrice) => {
    const thrown = throwOf(() => validateDealInput({ ...baseInput, unitPrice }, baseLot));
    expect(errorCode(thrown)).toBe(DEAL_ERROR_CODES.PRICE_OUT_OF_RANGE);
    expect(thrown).toBeInstanceOf(BadRequestException);
  });

  it('accepts the price bounds 1 and 2,000,000,000 Toman', () => {
    expect(validateDealInput({ ...baseInput, unitPrice: 1 }, baseLot).unitPrice).toBe(1);
    expect(
      validateDealInput({ ...baseInput, quantity: 1, unitPrice: 2_000_000_000 }, baseLot)
        .totalPrice,
    ).toBe(2_000_000_000);
  });

  it('rejects when the DERIVED totalPrice would exceed the money ceiling', () => {
    const thrown = throwOf(() =>
      validateDealInput({ ...baseInput, quantity: 40, unitPrice: 2_000_000_000 }, baseLot),
    );
    expect(errorCode(thrown)).toBe(DEAL_ERROR_CODES.PRICE_OUT_OF_RANGE);
  });

  it.each([
    ['a'.repeat(500), false, 'exactly 500 passes'],
    ['a'.repeat(501), true, '501 fails'],
    ['ژ'.repeat(500), false, '500 fa code points pass'],
    ['ژ'.repeat(501), true, '501 fa code points fail'],
  ])('deliveryNote length: %s (%s — %s)', (note, shouldThrow) => {
    const run = () => validateDealInput({ ...baseInput, deliveryNote: note }, baseLot);
    if (shouldThrow) {
      expect(errorCode(throwOf(run))).toBe(DEAL_ERROR_CODES.NOTE_TOO_LONG);
    } else {
      expect(() => run()).not.toThrow();
    }
  });

  it('applies the same cap to paymentTermsNote', () => {
    const thrown = throwOf(() =>
      validateDealInput({ ...baseInput, paymentTermsNote: 'a'.repeat(501) }, baseLot),
    );
    expect(errorCode(thrown)).toBe(DEAL_ERROR_CODES.NOTE_TOO_LONG);
  });

  it('stores whitespace-only notes as null (no empty-string rows)', () => {
    const validated = validateDealInput(
      { ...baseInput, deliveryNote: '   ', paymentTermsNote: '' },
      baseLot,
    );
    expect(validated.deliveryNote).toBeNull();
    expect(validated.paymentTermsNote).toBeNull();
  });

  it.each([
    [41, 'above available'],
    [100, 'way above available'],
    [0, 'zero'],
    [-5, 'negative'],
    [10.5, 'non-integer'],
  ])('rejects a quantity of %p (%s)', (quantity) => {
    const thrown = throwOf(() => validateDealInput({ ...baseInput, quantity }, baseLot));
    expect(errorCode(thrown)).toBe(DEAL_ERROR_CODES.QUANTITY_OUT_OF_RANGE);
    expect(thrown).toBeInstanceOf(ConflictException);
  });

  it('accepts the quantity bounds 1 and availableQuantity exactly (no minOrder floor — parties may agree on fewer pieces)', () => {
    expect(validateDealInput({ ...baseInput, quantity: 1 }, baseLot).quantity).toBe(1);
    expect(validateDealInput({ ...baseInput, quantity: 40 }, baseLot).quantity).toBe(40);
  });

  it('accepts every delivery × payment enum combination (recorded, not processed)', () => {
    for (const deliveryMethod of Object.values(DeliveryMethod)) {
      for (const paymentMethod of Object.values(PaymentMethodRecorded)) {
        const validated = validateDealInput(
          { ...baseInput, deliveryMethod, paymentMethod },
          baseLot,
        );
        expect(validated.deliveryMethod).toBe(deliveryMethod);
        expect(validated.paymentMethod).toBe(paymentMethod);
      }
    }
  });

  it('accepts a provenance offer from the SAME lot and rejects a cross-lot one', () => {
    expect(() =>
      validateDealInput(baseInput, baseLot, { id: 'offer-1', lotId: baseLot.id }),
    ).not.toThrow();

    const thrown = throwOf(() =>
      validateDealInput(baseInput, baseLot, { id: 'offer-2', lotId: 'lot-OTHER' }),
    );
    expect(errorCode(thrown)).toBe(DEAL_ERROR_CODES.OFFER_LOT_MISMATCH);
  });

  it('SNAPSHOT semantics: the validated copy never re-reads the lot or the input', () => {
    const lot = { id: 'lot-1', availableQuantity: 40 };
    const input: DealTermsInput = { ...baseInput };
    const validated = validateDealInput(input, lot);

    // The lot moves after creation (sold elsewhere / edited) — the deal terms
    // stand: prices and quantity were COPIED, nothing references the rows.
    lot.availableQuantity = 5;
    input.unitPrice = 999;
    input.quantity = 1;

    expect(validated).toEqual({
      quantity: 10,
      unitPrice: 1_000_000,
      totalPrice: 10_000_000,
      deliveryMethod: DeliveryMethod.SELLER_SHIPS,
      deliveryNote: null,
      paymentMethod: PaymentMethodRecorded.CARD_TO_CARD,
      paymentTermsNote: null,
      commissionRate: 0,
    });
  });
});

describe('creationEvent (the timeline is total from birth)', () => {
  it('appends the NEGOTIATING→NEGOTIATING entry with optional actor + note', () => {
    expect(creationEvent()).toEqual({
      actorId: null,
      fromStatus: DealStatus.NEGOTIATING,
      toStatus: DealStatus.NEGOTIATING,
      note: null,
    });
    expect(creationEvent({ actorId: BUYER_ID, note: ' معامله ایجاد شد ' })).toEqual({
      actorId: BUYER_ID,
      fromStatus: DealStatus.NEGOTIATING,
      toStatus: DealStatus.NEGOTIATING,
      note: 'معامله ایجاد شد',
    });
  });
});

describe('DealsService.transition (the matrix executor + timeline append)', () => {
  let fake: FakePrisma;
  let service: DealsService;
  let repository: DealsRepository;
  let lotId: string;

  beforeEach(() => {
    fake = new FakePrisma();
    repository = new DealsRepository(fake as unknown as PrismaService);
    // DEAL-002 widened the constructor (cross-module repositories); the
    // transition suites exercise only the matrix, so plain fake-backed
    // repositories are enough everywhere.
    service = new DealsService(
      repository,
      fake as unknown as PrismaService,
      new LotsRepository(fake as unknown as PrismaService),
      new OffersRepository(fake as unknown as PrismaService),
      new ConversationsRepository(fake as unknown as PrismaService),
      new UsersRepository(fake as unknown as PrismaService),
    );
    lotId = fake.seedLot({
      sellerId: SELLER_ID,
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
    }).id;
  });

  /** Seeds a deal sitting at `status` (with coherent terms + optional
   * overrides). No events — the timeline starts empty until a transition. */
  const seedDealAt = (
    status: DealStatus,
    overrides: Partial<Parameters<FakePrisma['seedDeal']>[0]> = {},
  ) =>
    fake.seedDeal({
      lotId,
      buyerId: BUYER_ID,
      sellerId: SELLER_ID,
      quantity: 10,
      unitPrice: 1_000_000,
      totalPrice: 10_000_000,
      deliveryMethod: DeliveryMethod.SELLER_SHIPS,
      paymentMethod: PaymentMethodRecorded.CARD_TO_CARD,
      status,
      ...overrides,
    });

  /** Every happy-path stage move of the card: from → to by role. */
  const STAGE_MOVES: Array<[DealStatus, DealStatus, DealRole]> = [
    [DealStatus.NEGOTIATING, DealStatus.AGREED, 'SELLER'],
    [DealStatus.AGREED, DealStatus.PAYMENT_PENDING, 'BUYER'],
    [DealStatus.PAYMENT_PENDING, DealStatus.PAID, 'SELLER'],
    [DealStatus.PAID, DealStatus.PREPARING, 'SELLER'],
    [DealStatus.PREPARING, DealStatus.SHIPPED, 'SELLER'],
    [DealStatus.SHIPPED, DealStatus.DELIVERED, 'SELLER'],
    [DealStatus.DELIVERED, DealStatus.COMPLETED, 'BUYER'],
  ];

  it.each(STAGE_MOVES)(
    '%s → %s (%s): moves, stamps the stage, appends the event',
    async (from, to, role) => {
      const deal = seedDealAt(from);
      const stampField = STAGE_TIMESTAMP_FIELDS[to];

      const updated = await service.transition(
        deal,
        to,
        role,
        { actorId: role === 'BUYER' ? BUYER_ID : SELLER_ID },
        NOW,
      );

      expect(updated.status).toBe(to);
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(deal.updatedAt.getTime());
      if (stampField !== null) {
        expect(updated[stampField]).toEqual(NOW);
      }

      const events = await repository.findEvents(deal.id);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        dealId: deal.id,
        actorId: role === 'BUYER' ? BUYER_ID : SELLER_ID,
        fromStatus: from,
        toStatus: to,
        note: null,
      });
    },
  );

  it('drives the whole happy path NEGOTIATING → COMPLETED, leaving an ordered timeline', async () => {
    let deal = seedDealAt(DealStatus.NEGOTIATING);

    let step = 0;
    for (const [, to, role] of STAGE_MOVES) {
      deal = await service.transition(
        deal,
        to,
        role,
        { actorId: role === 'BUYER' ? BUYER_ID : SELLER_ID },
        new Date(NOW.getTime() + step * 60_000),
      );
      step += 1;
    }

    expect(deal.status).toBe(DealStatus.COMPLETED);
    // The last move (DELIVERED → COMPLETED) stamped the 6th minute.
    expect(deal.completedAt).toEqual(new Date(NOW.getTime() + 6 * 60_000));

    const timeline = await service.timeline(deal.id);
    expect(timeline.map((event) => event.toStatus)).toEqual([
      DealStatus.AGREED,
      DealStatus.PAYMENT_PENDING,
      DealStatus.PAID,
      DealStatus.PREPARING,
      DealStatus.SHIPPED,
      DealStatus.DELIVERED,
      DealStatus.COMPLETED,
    ]);
    expect(timeline[0]?.fromStatus).toBe(DealStatus.NEGOTIATING); // oldest first
  });

  it('cancel stores the reason on the deal AND the event note (no stage stamp)', async () => {
    const deal = seedDealAt(DealStatus.NEGOTIATING);

    const updated = await service.transition(
      deal,
      DealStatus.CANCELLED,
      'BUYER',
      { actorId: BUYER_ID, note: ' قیمت مناسب نبود ' },
      NOW,
    );

    expect(updated.status).toBe(DealStatus.CANCELLED);
    expect(updated.cancelReason).toBe('قیمت مناسب نبود');
    expect(updated.completedAt).toBeNull();
    const events = await repository.findEvents(deal.id);
    expect(events[0]?.note).toBe('قیمت مناسب نبود');
  });

  it('dispute stores disputeReason the same way (reason past the ≥ 20-char floor — DEAL-003)', async () => {
    const deal = seedDealAt(DealStatus.AGREED);
    const reason = 'خریدار چند روز است پاسخگو نیست و پیامی نمی‌فرستد';

    const updated = await service.transition(
      deal,
      DealStatus.DISPUTED,
      'SELLER',
      { actorId: SELLER_ID, note: reason },
      NOW,
    );

    expect(updated.status).toBe(DealStatus.DISPUTED);
    expect(updated.disputeReason).toBe(reason);
  });

  it.each([
    [DealStatus.NEGOTIATING, DealStatus.CANCELLED, 'BUYER'],
    [DealStatus.AGREED, DealStatus.DISPUTED, 'BUYER'],
    [DealStatus.PAYMENT_PENDING, DealStatus.CANCELLED, 'SELLER'],
    [DealStatus.DISPUTED, DealStatus.CANCELLED, 'ADMIN'],
  ])('%s → %s (%s) without a reason answers REASON_REQUIRED (400)', async (from, to, role) => {
    const deal = seedDealAt(from);
    for (const note of [undefined, null, '   ']) {
      const thrown = await rejectsOf(() =>
        service.transition(deal, to, role as DealRole, { actorId: 'u1', note }, NOW),
      );
      expect(errorCode(thrown)).toBe(DEAL_ERROR_CODES.REASON_REQUIRED);
      expect(thrown).toBeInstanceOf(BadRequestException);
    }
    // Nothing was written.
    expect((await repository.findById(deal.id))?.status).toBe(from);
    expect(await repository.findEvents(deal.id)).toHaveLength(0);
  });

  it('rejects a reason past the 500-char cap with NOTE_TOO_LONG', async () => {
    const deal = seedDealAt(DealStatus.NEGOTIATING);
    const thrown = await rejectsOf(() =>
      service.transition(
        deal,
        DealStatus.CANCELLED,
        'SELLER',
        { actorId: SELLER_ID, note: 'x'.repeat(501) },
        NOW,
      ),
    );
    expect(errorCode(thrown)).toBe(DEAL_ERROR_CODES.NOTE_TOO_LONG);
  });

  it('denies the buyer the PAID confirm (only the seller confirms payment — 403) and writes nothing', async () => {
    const deal = seedDealAt(DealStatus.PAYMENT_PENDING, { paymentPendingAt: NOW });

    const thrown = await rejectsOf(() =>
      service.transition(deal, DealStatus.PAID, 'BUYER', { actorId: BUYER_ID }, NOW),
    );

    expect(errorCode(thrown)).toBe(DEAL_ERROR_CODES.TRANSITION_ROLE_FORBIDDEN);
    expect(thrown).toBeInstanceOf(ForbiddenException);
    expect((await repository.findById(deal.id))?.status).toBe(DealStatus.PAYMENT_PENDING);
    expect(await repository.findEvents(deal.id)).toHaveLength(0);
  });

  it('denies the seller the COMPLETED confirm (receipt is the buyer call — 403)', async () => {
    const deal = seedDealAt(DealStatus.DELIVERED, { deliveredAt: NOW });

    const thrown = await rejectsOf(() =>
      service.transition(deal, DealStatus.COMPLETED, 'SELLER', { actorId: SELLER_ID }, NOW),
    );

    expect(errorCode(thrown)).toBe(DEAL_ERROR_CODES.TRANSITION_ROLE_FORBIDDEN);
  });

  it('denies participants the DISPUTED resolution (ADMIN only — 403), then resolves as admin', async () => {
    const deal = seedDealAt(DealStatus.DISPUTED, { disputeReason: 'کالا مغایر توافق است' });

    for (const role of ['BUYER', 'SELLER'] as const) {
      const thrown = await rejectsOf(() =>
        service.transition(deal, DealStatus.COMPLETED, role, { actorId: 'u1' }, NOW),
      );
      expect(errorCode(thrown)).toBe(DEAL_ERROR_CODES.TRANSITION_ROLE_FORBIDDEN);
    }

    // …and the admin resolution goes through (DEAL-007 owns the endpoint).
    const resolved = await service.transition(
      deal,
      DealStatus.COMPLETED,
      'ADMIN',
      { actorId: 'admin-1', note: 'به نفع خریدار رسیدگی شد' },
      NOW,
    );
    expect(resolved.status).toBe(DealStatus.COMPLETED);
    expect(resolved.completedAt).toEqual(NOW);
  });

  it('answers ILLEGAL_TRANSITION (409) for a move the matrix does not know and writes nothing', async () => {
    const deal = seedDealAt(DealStatus.PAID, { paidAt: NOW });

    const thrown = await rejectsOf(() =>
      service.transition(deal, DealStatus.NEGOTIATING, 'ADMIN', { actorId: 'admin-1' }, NOW),
    );

    expect(errorCode(thrown)).toBe(DEAL_ERROR_CODES.ILLEGAL_TRANSITION);
    expect(thrown).toBeInstanceOf(ConflictException);
    expect((await repository.findById(deal.id))?.status).toBe(DealStatus.PAID);
    expect(await repository.findEvents(deal.id)).toHaveLength(0);
  });

  it('joins the caller transaction when one is passed (repo writes share the client)', async () => {
    const deal = seedDealAt(DealStatus.NEGOTIATING);
    const tx = fake as unknown as Prisma.TransactionClient;

    const updated = await service.transition(
      deal,
      DealStatus.AGREED,
      'BUYER',
      { actorId: BUYER_ID },
      NOW,
      tx,
    );

    expect(updated.status).toBe(DealStatus.AGREED);
    const events = await repository.findEvents(deal.id, tx);
    expect(events).toHaveLength(1);
  });
});

describe('DealsService.transition — the CANCELLED quantity restore (DEAL-002 reservation pair)', () => {
  let fake: FakePrisma;
  let service: DealsService;
  let repository: DealsRepository;
  let lotId: string;

  beforeEach(() => {
    fake = new FakePrisma();
    repository = new DealsRepository(fake as unknown as PrismaService);
    service = new DealsService(
      repository,
      fake as unknown as PrismaService,
      new LotsRepository(fake as unknown as PrismaService),
      new OffersRepository(fake as unknown as PrismaService),
      new ConversationsRepository(fake as unknown as PrismaService),
      new UsersRepository(fake as unknown as PrismaService),
    );
    // 30 available = 40 listed − 10 already reserved by the deals below.
    lotId = fake.seedLot({
      sellerId: SELLER_ID,
      categoryId: 'cat-1',
      title: 'عمده کفش ورزشی — ۴۰ جفت',
      quantity: 40,
      availableQuantity: 30,
      minOrderQuantity: 10,
      pricingType: PricingType.FIXED,
      totalPrice: 10_000_000,
      unitPrice: 250_000,
      condition: LotCondition.GRADE_A,
      liquidationReason: LiquidationReason.OVERSTOCK,
      province: 'tehran',
      city: 'tehran',
      status: LotStatus.ACTIVE,
      expiresAt: new Date(Date.now() + 30 * DAY_MS),
    }).id;
  });

  const seedDealAt = (
    status: DealStatus,
    overrides: Partial<Parameters<FakePrisma['seedDeal']>[0]> = {},
  ) =>
    fake.seedDeal({
      lotId,
      buyerId: BUYER_ID,
      sellerId: SELLER_ID,
      quantity: 10,
      unitPrice: 250_000,
      totalPrice: 2_500_000,
      deliveryMethod: DeliveryMethod.SELLER_SHIPS,
      paymentMethod: PaymentMethodRecorded.CARD_TO_CARD,
      status,
      ...overrides,
    });

  const availability = async (): Promise<number> => {
    const lot = await fake.lot.findUnique({ where: { id: lotId } });
    if (!lot) {
      throw new Error('lot vanished');
    }
    return lot.availableQuantity;
  };

  it.each([
    [DealStatus.NEGOTIATING, 'BUYER'],
    [DealStatus.AGREED, 'SELLER'],
    [DealStatus.PAYMENT_PENDING, 'SELLER'],
  ])('%s → CANCELLED (%s) restores the reserved quantity in the same write', async (from, role) => {
    const deal = seedDealAt(from);

    await service.transition(
      deal,
      DealStatus.CANCELLED,
      role as DealRole,
      { actorId: BUYER_ID, note: 'منصرف شدم' },
      NOW,
    );

    expect(await availability()).toBe(40);
  });

  it('DISPUTED → CANCELLED (admin resolution) does NOT auto-restore — DEAL-007 decides per outcome', async () => {
    const deal = seedDealAt(DealStatus.DISPUTED, { disputeReason: 'کالا مغایر توافق است' });

    await service.transition(
      deal,
      DealStatus.CANCELLED,
      'ADMIN',
      { actorId: 'admin-1', note: 'به نفع فروشنده رسیدگی شد' },
      NOW,
    );

    expect(await availability()).toBe(30);
  });

  it('non-cancel transitions never touch the lot (only →CANCELLED restores)', async () => {
    const deal = seedDealAt(DealStatus.NEGOTIATING);

    await service.transition(deal, DealStatus.AGREED, 'SELLER', { actorId: SELLER_ID }, NOW);

    expect(await availability()).toBe(30);
  });
});

describe('DealsService.create — DEAL-002 (offer path, quick path, reservation)', () => {
  let fake: FakePrisma;
  let service: DealsService;
  let repository: DealsRepository;
  let lotsRepository: LotsRepository;

  /** Deterministic terms payload (offer path: must mirror the seeded offer). */
  const baseDto = {
    quantity: 10,
    unitPrice: 300_000,
    deliveryMethod: DeliveryMethod.SELLER_SHIPS,
    paymentMethod: PaymentMethodRecorded.CARD_TO_CARD,
  };

  const seedBuyer = (roles: AccountRole[] = [AccountRole.BUYER]): { id: string } => ({
    id: fake.seedUser({
      phone: `0912${Math.random().toString().slice(2, 9)}`,
      name: 'خریدار',
      accountRoles: roles,
    }).id,
  });

  const seedLot = (overrides: Partial<Parameters<FakePrisma['seedLot']>[0]> = {}) =>
    fake.seedLot({
      sellerId: SELLER_ID,
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
      ...overrides,
    });

  const seedAcceptedOffer = (
    lotId: string,
    buyerId: string,
    overrides: Partial<Parameters<FakePrisma['seedOffer']>[0]> = {},
  ) =>
    fake.seedOffer({
      lotId,
      buyerId,
      sellerId: SELLER_ID,
      quantity: 10,
      unitPrice: 300_000,
      totalPrice: 3_000_000,
      status: OfferStatus.ACCEPTED,
      expiresAt: new Date(Date.now() + DAY_MS),
      ...overrides,
    });

  beforeEach(() => {
    fake = new FakePrisma();
    repository = new DealsRepository(fake as unknown as PrismaService);
    lotsRepository = new LotsRepository(fake as unknown as PrismaService);
    service = new DealsService(
      repository,
      fake as unknown as PrismaService,
      lotsRepository,
      new OffersRepository(fake as unknown as PrismaService),
      new ConversationsRepository(fake as unknown as PrismaService),
      new UsersRepository(fake as unknown as PrismaService),
    );
  });

  const availability = async (lotId: string): Promise<number> => {
    const lot = await fake.lot.findUnique({ where: { id: lotId } });
    if (!lot) {
      throw new Error('lot vanished');
    }
    return lot.availableQuantity;
  };

  // ---------------------------------------------------------------
  // Path (a): from an ACCEPTED offer
  // ---------------------------------------------------------------

  describe('offer path', () => {
    it('creates from an ACCEPTED offer: terms snapshotted FROM THE OFFER, lot reserved, birth event carries «معامله ایجاد شد #CODE»', async () => {
      const buyer = seedBuyer();
      const lot = seedLot();
      const offer = seedAcceptedOffer(lot.id, buyer.id);

      const response = await service.create(buyer.id, { offerId: offer.id, ...baseDto });

      expect(response.myRole).toBe('buyer');
      expect(response.status).toBe(DealStatus.NEGOTIATING);
      // The snapshot IS the offer's terms (never the payload's identity).
      expect(response.quantity).toBe(10);
      expect(response.unitPrice).toBe(300_000);
      expect(response.totalPrice).toBe(3_000_000);
      expect(response.lot).toEqual({ code: lot.code, title: lot.title });
      expect(response.deliveryMethod).toBe(DeliveryMethod.SELLER_SHIPS);
      expect(response.paymentMethod).toBe(PaymentMethodRecorded.CARD_TO_CARD);

      // The row: provenance + denormalized seller + the reserved commission.
      const row = await repository.findByCode(response.code);
      expect(row).toMatchObject({
        lotId: lot.id,
        buyerId: buyer.id,
        sellerId: SELLER_ID,
        offerId: offer.id,
        commissionRate: 0,
      });

      // The reservation: 40 − 10.
      expect(await availability(lot.id)).toBe(30);

      // The timeline is total from birth, with the fa creation note.
      const events = await repository.findEvents(row?.id as string);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        actorId: buyer.id,
        fromStatus: DealStatus.NEGOTIATING,
        toStatus: DealStatus.NEGOTIATING,
        note: dealCreatedActionBody(response.code),
      });
    });

    it('answers 404 for an unknown offer', async () => {
      const buyer = seedBuyer();
      const thrown = await rejectsOf(() =>
        service.create(buyer.id, { offerId: 'no-such-offer', ...baseDto }),
      );
      expect(thrown).toBeInstanceOf(NotFoundException);
    });

    it('answers 403 OFFER_NOT_BUYER for another buyer’s offer (ownership before state)', async () => {
      const buyer = seedBuyer();
      const other = seedBuyer();
      const lot = seedLot();
      const offer = seedAcceptedOffer(lot.id, other.id);

      const thrown = await rejectsOf(() =>
        service.create(buyer.id, { offerId: offer.id, ...baseDto }),
      );
      expect(errorCode(thrown)).toBe(DEAL_ERROR_CODES.OFFER_NOT_BUYER);
      expect(thrown).toBeInstanceOf(ForbiddenException);
    });

    it.each([
      [OfferStatus.PENDING, 'OFFER_NOT_ACCEPTED'],
      [OfferStatus.COUNTERED, 'OFFER_NOT_ACCEPTED'],
      [OfferStatus.REJECTED, 'OFFER_NOT_ACCEPTED'],
      [OfferStatus.CANCELLED, 'OFFER_NOT_ACCEPTED'],
      [OfferStatus.EXPIRED, 'OFFER_EXPIRED'],
    ])(
      'a %s offer answers 409 %s (the card’s “bad offer state” as state codes)',
      async (status, expectedCode) => {
        const buyer = seedBuyer();
        const lot = seedLot();
        const offer = seedAcceptedOffer(lot.id, buyer.id, { status });

        const thrown = await rejectsOf(() =>
          service.create(buyer.id, { offerId: offer.id, ...baseDto }),
        );
        expect(errorCode(thrown)).toBe(expectedCode);
        expect(thrown).toBeInstanceOf(ConflictException);
        // Nothing was reserved on a failed create.
        expect(await availability(lot.id)).toBe(40);
      },
    );

    it('the payload may only CONFIRM the offer terms: a disagreeing quantity or unitPrice is 400 OFFER_TERMS_MISMATCH', async () => {
      const buyer = seedBuyer();
      const lot = seedLot();
      const offer = seedAcceptedOffer(lot.id, buyer.id);

      const qtyThrown = await rejectsOf(() =>
        service.create(buyer.id, { offerId: offer.id, ...baseDto, quantity: 9 }),
      );
      expect(errorCode(qtyThrown)).toBe(DEAL_ERROR_CODES.OFFER_TERMS_MISMATCH);

      const priceThrown = await rejectsOf(() =>
        service.create(buyer.id, { offerId: offer.id, ...baseDto, unitPrice: 301_000 }),
      );
      expect(errorCode(priceThrown)).toBe(DEAL_ERROR_CODES.OFFER_TERMS_MISMATCH);

      // Omitting the price echo is fine (the snapshot comes from the offer).
      await expect(
        service.create(buyer.id, {
          offerId: offer.id,
          quantity: 10,
          deliveryMethod: DeliveryMethod.SELLER_SHIPS,
          paymentMethod: PaymentMethodRecorded.CARD_TO_CARD,
        }),
      ).resolves.toMatchObject({ unitPrice: 300_000 });
    });

    it('a lot gone inactive after acceptance answers 409 LOT_NOT_ACTIVE; shrunken stock answers the validator’s 409', async () => {
      const buyer = seedBuyer();
      const lot = seedLot();
      const offer = seedAcceptedOffer(lot.id, buyer.id);

      await fake.lot.update({ where: { id: lot.id }, data: { status: LotStatus.PAUSED } });
      const inactiveThrown = await rejectsOf(() =>
        service.create(buyer.id, { offerId: offer.id, ...baseDto }),
      );
      expect(errorCode(inactiveThrown)).toBe(DEAL_ERROR_CODES.LOT_NOT_ACTIVE);

      const shrunkLot = seedLot({ availableQuantity: 5 });
      const shrunkOffer = seedAcceptedOffer(shrunkLot.id, buyer.id, {
        quantity: 10,
        unitPrice: 300_000,
        totalPrice: 3_000_000,
      });
      const qtyThrown = await rejectsOf(() =>
        service.create(buyer.id, { offerId: shrunkOffer.id, ...baseDto }),
      );
      expect(errorCode(qtyThrown)).toBe(DEAL_ERROR_CODES.QUANTITY_OUT_OF_RANGE);
      expect(await availability(shrunkLot.id)).toBe(5);
    });

    it('ties the ACTION message to the OFFER’s conversation when the offer has one', async () => {
      const buyer = seedBuyer();
      const lot = seedLot();
      const conversation = fake.seedConversation({
        lotId: lot.id,
        buyerId: buyer.id,
        sellerId: SELLER_ID,
        lastMessageAt: new Date(Date.now() - 60_000),
      });
      const offer = seedAcceptedOffer(lot.id, buyer.id, { conversationId: conversation.id });

      const response = await service.create(buyer.id, { offerId: offer.id, ...baseDto });

      const messages = await fake.message.findMany({ where: { conversationId: conversation.id } });
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        type: MessageType.ACTION,
        senderId: buyer.id,
        body: dealCreatedActionBody(response.code),
      });
      const row = await repository.findByCode(response.code);
      expect(row?.conversationId).toBe(conversation.id);
    });
  });

  // ---------------------------------------------------------------
  // Path (b): the conversation quick path (FIXED-price lots)
  // ---------------------------------------------------------------

  describe('conversation quick path', () => {
    const seedThread = (buyerId: string, lotId: string) =>
      fake.seedConversation({
        lotId,
        buyerId,
        sellerId: SELLER_ID,
        lastMessageAt: new Date(Date.now() - 60_000),
      });

    it('creates from a conversation on a FIXED lot: price locked FROM THE LOT, quantity the buyer’s choice, stock reserved', async () => {
      const buyer = seedBuyer();
      const lot = seedLot({
        pricingType: PricingType.FIXED,
        unitPrice: 250_000,
        totalPrice: 12_500_000,
      });
      const conversation = seedThread(buyer.id, lot.id);

      const response = await service.create(buyer.id, {
        conversationId: conversation.id,
        quantity: 5,
        deliveryMethod: DeliveryMethod.PICKUP,
        paymentMethod: PaymentMethodRecorded.CASH,
      });

      // The price is the LOT's, even though the payload sent none.
      expect(response.unitPrice).toBe(250_000);
      expect(response.totalPrice).toBe(1_250_000);
      expect(response.quantity).toBe(5);
      const row = await repository.findByCode(response.code);
      expect(row).toMatchObject({
        lotId: lot.id,
        buyerId: buyer.id,
        sellerId: SELLER_ID,
        offerId: null,
        conversationId: conversation.id,
      });
      expect(await availability(lot.id)).toBe(35);
    });

    it('the price echo may confirm lot.unitPrice but never change it (400 DEAL_PRICE_LOCKED)', async () => {
      const buyer = seedBuyer();
      const lot = seedLot({ pricingType: PricingType.FIXED, unitPrice: 250_000 });
      const conversation = seedThread(buyer.id, lot.id);

      const thrown = await rejectsOf(() =>
        service.create(buyer.id, {
          conversationId: conversation.id,
          quantity: 5,
          unitPrice: 999,
          deliveryMethod: DeliveryMethod.PICKUP,
          paymentMethod: PaymentMethodRecorded.CASH,
        }),
      );
      expect(errorCode(thrown)).toBe(DEAL_ERROR_CODES.DEAL_PRICE_LOCKED);
      expect(await availability(lot.id)).toBe(40);
    });

    it('NEGOTIABLE lots are out of the quick path’s scope (409 LOT_NOT_FIXED_PRICE)', async () => {
      const buyer = seedBuyer();
      const lot = seedLot({ pricingType: PricingType.NEGOTIABLE });
      const conversation = seedThread(buyer.id, lot.id);

      const thrown = await rejectsOf(() =>
        service.create(buyer.id, {
          conversationId: conversation.id,
          quantity: 5,
          deliveryMethod: DeliveryMethod.PICKUP,
          paymentMethod: PaymentMethodRecorded.CASH,
        }),
      );
      expect(errorCode(thrown)).toBe(DEAL_ERROR_CODES.LOT_NOT_FIXED_PRICE);
    });

    it('unknown AND foreign conversations answer the uniform 403 CONVERSATION_NOT_YOURS', async () => {
      const buyer = seedBuyer();
      const other = seedBuyer();
      const lot = seedLot({ pricingType: PricingType.FIXED });
      const foreignThread = seedThread(other.id, lot.id);

      for (const conversationId of ['no-such-thread', foreignThread.id]) {
        const thrown = await rejectsOf(() =>
          service.create(buyer.id, {
            conversationId,
            quantity: 5,
            deliveryMethod: DeliveryMethod.PICKUP,
            paymentMethod: PaymentMethodRecorded.CASH,
          }),
        );
        expect(errorCode(thrown)).toBe(DEAL_ERROR_CODES.CONVERSATION_NOT_YOURS);
        expect(thrown).toBeInstanceOf(ForbiddenException);
      }
    });

    it('posts the ACTION message + conversation lockstep (preview moves, seller unread +1)', async () => {
      const buyer = seedBuyer();
      const lot = seedLot({ pricingType: PricingType.FIXED, unitPrice: 250_000 });
      const conversation = seedThread(buyer.id, lot.id);

      const response = await service.create(buyer.id, {
        conversationId: conversation.id,
        quantity: 5,
        deliveryMethod: DeliveryMethod.PICKUP,
        paymentMethod: PaymentMethodRecorded.CASH,
      });

      const messages = await fake.message.findMany({ where: { conversationId: conversation.id } });
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        type: MessageType.ACTION,
        senderId: buyer.id,
        body: dealCreatedActionBody(response.code),
      });
      const thread = await fake.conversation.findUnique({ where: { id: conversation.id } });
      expect(thread).toMatchObject({
        lastMessagePreview: dealCreatedActionBody(response.code),
        sellerUnreadCount: 1,
        buyerUnreadCount: 0,
      });
    });
  });

  // ---------------------------------------------------------------
  // Common: hats, provenance shape, reservation atomicity
  // ---------------------------------------------------------------

  it('requires the BUYER hat (403 BUYER_REQUIRED) and exactly one provenance id (400s)', async () => {
    const hatless = seedBuyer([]);
    const lot = seedLot({ pricingType: PricingType.FIXED });

    const hatThrown = await rejectsOf(() =>
      service.create(hatless.id, {
        conversationId: 'whatever',
        quantity: 5,
        deliveryMethod: DeliveryMethod.PICKUP,
        paymentMethod: PaymentMethodRecorded.CASH,
      }),
    );
    expect(errorCode(hatThrown)).toBe(DEAL_ERROR_CODES.BUYER_REQUIRED);

    const buyer = seedBuyer();
    const neitherThrown = await rejectsOf(() =>
      service.create(buyer.id, {
        quantity: 5,
        deliveryMethod: DeliveryMethod.PICKUP,
        paymentMethod: PaymentMethodRecorded.CASH,
      }),
    );
    expect(errorCode(neitherThrown)).toBe(DEAL_ERROR_CODES.PROVENANCE_REQUIRED);

    const conversation = fake.seedConversation({
      lotId: lot.id,
      buyerId: buyer.id,
      sellerId: SELLER_ID,
      lastMessageAt: new Date(),
    });
    const offer = seedAcceptedOffer(lot.id, buyer.id);
    const bothThrown = await rejectsOf(() =>
      service.create(buyer.id, {
        offerId: offer.id,
        conversationId: conversation.id,
        ...baseDto,
      }),
    );
    expect(errorCode(bothThrown)).toBe(DEAL_ERROR_CODES.PROVENANCE_EXCLUSIVE);
  });

  it('the reservation guard answers 409 INSUFFICIENT_QUANTITY when the conditional decrement matches nothing', async () => {
    const buyer = seedBuyer();
    const lot = seedLot({ pricingType: PricingType.FIXED });
    const conversation = fake.seedConversation({
      lotId: lot.id,
      buyerId: buyer.id,
      sellerId: SELLER_ID,
      lastMessageAt: new Date(),
    });
    // Simulate the race: the validator saw enough stock, the atomic
    // reservation found none.
    jest.spyOn(lotsRepository, 'reserveQuantity').mockResolvedValue(0);

    const thrown = await rejectsOf(() =>
      service.create(buyer.id, {
        conversationId: conversation.id,
        quantity: 5,
        deliveryMethod: DeliveryMethod.PICKUP,
        paymentMethod: PaymentMethodRecorded.CASH,
      }),
    );
    expect(errorCode(thrown)).toBe(DEAL_ERROR_CODES.INSUFFICIENT_QUANTITY);
    expect(await availability(lot.id)).toBe(40);
  });

  it('ATOMICITY: a failure after the reservation rolls it back — no decrement persists', async () => {
    const buyer = seedBuyer();
    const lot = seedLot({ pricingType: PricingType.FIXED });
    const conversation = fake.seedConversation({
      lotId: lot.id,
      buyerId: buyer.id,
      sellerId: SELLER_ID,
      lastMessageAt: new Date(),
    });
    // The deal write explodes AFTER the reservation (any non-P2002 failure
    // propagates — no retry).
    jest.spyOn(repository, 'create').mockRejectedValue(new Error('boom'));

    await expect(
      service.create(buyer.id, {
        conversationId: conversation.id,
        quantity: 5,
        deliveryMethod: DeliveryMethod.PICKUP,
        paymentMethod: PaymentMethodRecorded.CASH,
      }),
    ).rejects.toThrow('boom');

    // The transaction aborted: the reserved stock is back.
    expect(await availability(lot.id)).toBe(40);
    // No thread announcement either.
    const messages = await fake.message.findMany({ where: { conversationId: conversation.id } });
    expect(messages).toHaveLength(0);
  });

  it('retries a Deal.code collision (P2002) with a fresh code and reserves exactly once', async () => {
    const buyer = seedBuyer();
    const lot = seedLot({ pricingType: PricingType.FIXED, unitPrice: 250_000 });
    const conversation = fake.seedConversation({
      lotId: lot.id,
      buyerId: buyer.id,
      sellerId: SELLER_ID,
      lastMessageAt: new Date(),
    });

    const realCreate = fake.deal.create.bind(fake.deal);
    let calls = 0;
    jest.spyOn(fake.deal, 'create').mockImplementation(async (args) => {
      calls += 1;
      if (calls === 1) {
        const error = new Error('Unique constraint failed on Deal.code') as Error & {
          code: string;
        };
        error.code = 'P2002';
        throw error;
      }
      return realCreate(args);
    });

    const response = await service.create(buyer.id, {
      conversationId: conversation.id,
      quantity: 5,
      deliveryMethod: DeliveryMethod.PICKUP,
      paymentMethod: PaymentMethodRecorded.CASH,
    });

    expect(calls).toBe(2);
    // The failed attempt's reservation rolled back; exactly ONE decrement stuck.
    expect(await availability(lot.id)).toBe(35);
    expect(await repository.findByCode(response.code)).not.toBeNull();
    const messages = await fake.message.findMany({ where: { conversationId: conversation.id } });
    expect(messages).toHaveLength(1);
  });
});

describe('DealsService DEAL-003 — transitionFromCode / cancelFromCode / confirmPaymentFromCode', () => {
  let fake: FakePrisma;
  let service: DealsService;
  let repository: DealsRepository;
  let lotId: string;

  beforeEach(() => {
    fake = new FakePrisma();
    repository = new DealsRepository(fake as unknown as PrismaService);
    service = new DealsService(
      repository,
      fake as unknown as PrismaService,
      new LotsRepository(fake as unknown as PrismaService),
      new OffersRepository(fake as unknown as PrismaService),
      new ConversationsRepository(fake as unknown as PrismaService),
      new UsersRepository(fake as unknown as PrismaService),
    );
    lotId = fake.seedLot({
      sellerId: SELLER_ID,
      categoryId: 'cat-1',
      title: 'عمده پیراهن مردانه — ۵۰ عدد',
      quantity: 50,
      availableQuantity: 30,
      minOrderQuantity: 10,
      pricingType: PricingType.FIXED,
      totalPrice: 50_000_000,
      unitPrice: 1_000_000,
      condition: LotCondition.GRADE_A,
      liquidationReason: LiquidationReason.OVERSTOCK,
      province: 'tehran',
      city: 'tehran',
      status: LotStatus.ACTIVE,
      expiresAt: new Date(Date.now() + 30 * DAY_MS),
    }).id;
  });

  const seedDealAt = (
    status: DealStatus,
    overrides: Partial<Parameters<FakePrisma['seedDeal']>[0]> = {},
  ) =>
    fake.seedDeal({
      lotId,
      buyerId: BUYER_ID,
      sellerId: SELLER_ID,
      quantity: 10,
      unitPrice: 1_000_000,
      totalPrice: 10_000_000,
      deliveryMethod: DeliveryMethod.SELLER_SHIPS,
      paymentMethod: PaymentMethodRecorded.CARD_TO_CARD,
      status,
      ...overrides,
    });

  const availability = async (id: string): Promise<number | undefined> =>
    (await fake.lot.findUnique({ where: { id } }))?.availableQuantity;

  describe('the gates (participant resolution + stale-state guard)', () => {
    it('answers 409 DEAL_STALE_STATE when the row moved between the read and the write', async () => {
      const deal = seedDealAt(DealStatus.NEGOTIATING);
      // A concurrent writer wins: the stored row is AGREED while this caller
      // still holds the NEGOTIATING snapshot (a legal move on their view).
      await fake.deal.update({
        where: { id: deal.id },
        data: { status: DealStatus.AGREED, agreedAt: new Date() },
      });

      const thrown = await rejectsOf(() =>
        service.transition(deal, DealStatus.CANCELLED, 'SELLER', {
          actorId: SELLER_ID,
          note: 'خریدار منصرف شد',
        }),
      );

      expect(thrown).toBeInstanceOf(ConflictException);
      expect(errorCode(thrown)).toBe(DEAL_ERROR_CODES.DEAL_STALE_STATE);
      // Nothing leaked: no event, no cancellation, no quantity restore.
      expect(await repository.findEvents(deal.id)).toHaveLength(0);
      expect((await repository.findById(deal.id))?.status).toBe(DealStatus.AGREED);
      expect(await availability(lotId)).toBe(30);
    });

    it('404 DEAL_NOT_FOUND for an unknown code', async () => {
      const thrown = await rejectsOf(() =>
        service.transitionFromCode('no-such-code', BUYER_ID, { to: DealStatus.AGREED }),
      );
      expect(thrown).toBeInstanceOf(NotFoundException);
      expect(errorCode(thrown)).toBe(DEAL_ERROR_CODES.DEAL_NOT_FOUND);
    });

    it('403 DEAL_NOT_PARTICIPANT for a user who is neither buyer nor seller', async () => {
      const deal = seedDealAt(DealStatus.NEGOTIATING);
      const outsider = 'someone-else';
      const thrown = await rejectsOf(() =>
        service.transitionFromCode(deal.code, outsider, { to: DealStatus.AGREED }),
      );
      expect(thrown).toBeInstanceOf(ForbiddenException);
      expect(errorCode(thrown)).toBe(DEAL_ERROR_CODES.DEAL_NOT_PARTICIPANT);
    });
  });

  describe('transitionFromCode (matrix + response)', () => {
    it('moves the deal and answers the allowlisted payload with myRole + lot summary', async () => {
      const deal = seedDealAt(DealStatus.NEGOTIATING);
      const lot = (await fake.lot.findUnique({ where: { id: lotId } }))!;

      const response = await service.transitionFromCode(deal.code, SELLER_ID, {
        to: DealStatus.AGREED,
      });

      expect(response.status).toBe(DealStatus.AGREED);
      expect(response.myRole).toBe('seller');
      expect(response.lot).toEqual({ code: lot.code, title: lot.title });
      // The stage stamp lives on the row (the payload allowlist doesn't carry it).
      const stamped = await repository.findByCode(deal.code);
      expect(stamped?.agreedAt).toBeDefined();
      // Row moved + timeline appended.
      const row = await repository.findByCode(deal.code);
      expect(row?.status).toBe(DealStatus.AGREED);
      const events = await repository.findEvents(deal.id);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        actorId: SELLER_ID,
        fromStatus: DealStatus.NEGOTIATING,
        toStatus: DealStatus.AGREED,
      });
    });

    it('surfaces the matrix role denial through the code route (403)', async () => {
      const deal = seedDealAt(DealStatus.PAYMENT_PENDING);
      // The buyer may NOT confirm payment received — that is the seller's row.
      const thrown = await rejectsOf(() =>
        service.transitionFromCode(deal.code, BUYER_ID, { to: DealStatus.PAID }),
      );
      expect(thrown).toBeInstanceOf(ForbiddenException);
      expect(errorCode(thrown)).toBe(DEAL_ERROR_CODES.TRANSITION_ROLE_FORBIDDEN);
    });

    it('rejects a too-short dispute reason with 400 DISPUTE_REASON_TOO_SHORT (the ≥ 20-char rule)', async () => {
      const deal = seedDealAt(DealStatus.AGREED);
      const short = await rejectsOf(() =>
        service.transitionFromCode(deal.code, BUYER_ID, {
          to: DealStatus.DISPUTED,
          note: 'خیلی کوتاه',
        }),
      );
      expect(short).toBeInstanceOf(BadRequestException);
      expect(errorCode(short)).toBe(DEAL_ERROR_CODES.DISPUTE_REASON_TOO_SHORT);

      // A reason past the floor goes through and lands on the row + timeline.
      const reason = 'کالا با آنچه در عکس‌ها نشان داده شده بود تفاوت اساسی دارد';
      const response = await service.transitionFromCode(deal.code, BUYER_ID, {
        to: DealStatus.DISPUTED,
        note: reason,
      });
      expect(response.status).toBe(DealStatus.DISPUTED);
      const row = await repository.findByCode(deal.code);
      expect(row?.disputeReason).toBe(reason);
    });
  });

  describe('cancelFromCode (the →CANCELLED shorthand)', () => {
    it('writes the reason to cancelReason + the timeline and RESTORES the reserved quantity', async () => {
      const deal = seedDealAt(DealStatus.NEGOTIATING);
      const before = await availability(lotId);

      const response = await service.cancelFromCode(deal.code, BUYER_ID, 'خریدار منصرف شد');

      expect(response.status).toBe(DealStatus.CANCELLED);
      expect(response.myRole).toBe('buyer');
      const row = await repository.findByCode(deal.code);
      expect(row).toMatchObject({ status: DealStatus.CANCELLED, cancelReason: 'خریدار منصرف شد' });
      expect(await availability(lotId)).toBe((before ?? 0) + deal.quantity);
      const events = await repository.findEvents(deal.id);
      expect(events[events.length - 1]).toMatchObject({
        toStatus: DealStatus.CANCELLED,
        note: 'خریدار منصرف شد',
      });
    });
  });

  describe('confirmPaymentFromCode (the buyer’s «پرداخت کردم» mark)', () => {
    it('stamps paidConfirmedByBuyerAt + appends the informational event, status unchanged', async () => {
      const deal = seedDealAt(DealStatus.PAYMENT_PENDING);

      const response = await service.confirmPaymentFromCode(deal.code, BUYER_ID, NOW);

      expect(response.status).toBe(DealStatus.PAYMENT_PENDING);
      expect(response.myRole).toBe('buyer');
      const row = await repository.findByCode(deal.code);
      expect(row?.paidConfirmedByBuyerAt?.getTime()).toBe(NOW.getTime());
      const events = await repository.findEvents(deal.id);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        actorId: BUYER_ID,
        fromStatus: DealStatus.PAYMENT_PENDING,
        toStatus: DealStatus.PAYMENT_PENDING,
        note: 'خریدار پرداخت را اعلام کرد',
      });
    });

    it('403 PAYMENT_CONFIRM_BUYER_ONLY for the seller', async () => {
      const deal = seedDealAt(DealStatus.PAYMENT_PENDING);
      const thrown = await rejectsOf(() => service.confirmPaymentFromCode(deal.code, SELLER_ID));
      expect(thrown).toBeInstanceOf(ForbiddenException);
      expect(errorCode(thrown)).toBe(DEAL_ERROR_CODES.PAYMENT_CONFIRM_BUYER_ONLY);
    });

    it('409 PAYMENT_NOT_PENDING outside the payment stage', async () => {
      const deal = seedDealAt(DealStatus.NEGOTIATING);
      const thrown = await rejectsOf(() => service.confirmPaymentFromCode(deal.code, BUYER_ID));
      expect(thrown).toBeInstanceOf(ConflictException);
      expect(errorCode(thrown)).toBe(DEAL_ERROR_CODES.PAYMENT_NOT_PENDING);
    });

    it('409 PAYMENT_ALREADY_CONFIRMED on the second mark (one event, not two)', async () => {
      const deal = seedDealAt(DealStatus.PAYMENT_PENDING);
      await service.confirmPaymentFromCode(deal.code, BUYER_ID, NOW);

      const thrown = await rejectsOf(() => service.confirmPaymentFromCode(deal.code, BUYER_ID));
      expect(thrown).toBeInstanceOf(ConflictException);
      expect(errorCode(thrown)).toBe(DEAL_ERROR_CODES.PAYMENT_ALREADY_CONFIRMED);
      expect(await repository.findEvents(deal.id)).toHaveLength(1);
    });
  });
});
