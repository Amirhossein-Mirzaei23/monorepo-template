import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import {
  DealStatus,
  DeliveryMethod,
  LiquidationReason,
  LotCondition,
  LotStatus,
  PaymentMethodRecorded,
  PricingType,
  type Prisma,
} from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';
import { FakePrisma } from '../../../test/fakes/fake-prisma';
import { DealsRepository } from '../deals.repository';
import { DEAL_ERROR_CODES, STAGE_TIMESTAMP_FIELDS, type DealRole } from '../deals.constants';
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
    service = new DealsService(repository, fake as unknown as PrismaService);
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

  it('dispute stores disputeReason the same way', async () => {
    const deal = seedDealAt(DealStatus.AGREED);

    const updated = await service.transition(
      deal,
      DealStatus.DISPUTED,
      'SELLER',
      { actorId: SELLER_ID, note: 'خریدار پاسخگو نیست' },
      NOW,
    );

    expect(updated.status).toBe(DealStatus.DISPUTED);
    expect(updated.disputeReason).toBe('خریدار پاسخگو نیست');
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
