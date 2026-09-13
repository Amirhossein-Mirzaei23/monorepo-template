import {
  DealStatus,
  DeliveryMethod,
  LiquidationReason,
  LotCondition,
  LotStatus,
  PaymentMethodRecorded,
  PricingType,
} from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';
import { FakePrisma } from '../../../test/fakes/fake-prisma';
import { DealsRepository, type CreateDealArgs } from '../deals.repository';
import { creationEvent } from '../deals.service';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('DealsRepository (vs FakePrisma — data access only)', () => {
  let fake: FakePrisma;
  let repository: DealsRepository;
  let lotId: string;

  /** The minimal creation payload: deal row + its birth event (the pair
   * `create` persists through one client). */
  const createArgs = (overrides: Partial<CreateDealArgs['deal']> = {}): CreateDealArgs => ({
    deal: {
      code: 'DLR7XQ2M',
      lotId,
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      quantity: 10,
      unitPrice: 1_000_000,
      totalPrice: 10_000_000,
      deliveryMethod: DeliveryMethod.SELLER_SHIPS,
      paymentMethod: PaymentMethodRecorded.CARD_TO_CARD,
      ...overrides,
    },
    event: creationEvent({ actorId: 'buyer-1' }),
  });

  beforeEach(() => {
    fake = new FakePrisma();
    repository = new DealsRepository(fake as unknown as PrismaService);
    lotId = fake.seedLot({
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
    }).id;
  });

  describe('create (deal + creation event in one client) + findById + findByCode', () => {
    it('persists the pair and applies the DB defaults (NEGOTIATING, rate 0, no stamps)', async () => {
      const created = await repository.create(createArgs());

      const loaded = await repository.findById(created.id);
      expect(loaded).not.toBeNull();
      expect(loaded?.status).toBe(DealStatus.NEGOTIATING);
      expect(loaded?.commissionRate).toBe(0);
      expect(loaded?.commissionAmount).toBeNull();
      expect(loaded?.cancelReason).toBeNull();
      expect(loaded?.disputeReason).toBeNull();
      expect(loaded?.agreedAt).toBeNull();
      expect(loaded?.completedAt).toBeNull();
      expect(loaded?.offerId).toBeNull();
      expect(loaded?.conversationId).toBeNull();

      // The timeline is total from birth.
      const events = await repository.findEvents(created.id);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        dealId: created.id,
        actorId: 'buyer-1',
        fromStatus: DealStatus.NEGOTIATING,
        toStatus: DealStatus.NEGOTIATING,
        note: null,
      });
    });

    it('resolves by the public code and answers null for unknown ids/codes', async () => {
      const created = await repository.create(createArgs());

      expect((await repository.findByCode('DLR7XQ2M'))?.id).toBe(created.id);
      expect(await repository.findByCode('MISSING1')).toBeNull();
      expect(await repository.findById('missing-id')).toBeNull();
    });

    it('mirrors the FKs: no deal without its lot, no event without its deal', async () => {
      await expect(repository.create(createArgs({ lotId: 'missing-lot' }))).rejects.toThrow(
        'FakePrisma: deal references missing lot missing-lot',
      );

      await expect(
        repository.appendEvent({
          dealId: 'missing-deal',
          fromStatus: DealStatus.NEGOTIATING,
          toStatus: DealStatus.AGREED,
        }),
      ).rejects.toThrow('FakePrisma: dealEvent references missing deal missing-deal');
    });
  });

  describe('updateIfStatus (the guarded transition write — DEAL-003)', () => {
    it('writes only the provided scalars, bumps updatedAt, and answers count 1 on the matching status', async () => {
      const deal = await repository.create(createArgs());
      const before = await repository.findById(deal.id);
      const now = new Date();

      const moved = await repository.updateIfStatus(deal.id, DealStatus.NEGOTIATING, {
        status: DealStatus.AGREED,
        agreedAt: now,
      });

      expect(moved).toBe(1);
      const updated = await repository.findById(deal.id);
      expect(updated?.status).toBe(DealStatus.AGREED);
      expect(updated?.agreedAt).toEqual(now);
      expect(updated?.unitPrice).toBe(before?.unitPrice); // untouched
      expect(updated?.quantity).toBe(before?.quantity);
      expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(before?.updatedAt.getTime() ?? 0);
    });

    it('answers count 0 when the row is gone or its status moved on (the race guard)', async () => {
      const deal = await repository.create(createArgs());

      // Unknown id — nothing matches.
      await expect(
        repository.updateIfStatus('missing-id', DealStatus.NEGOTIATING, {
          status: DealStatus.CANCELLED,
        }),
      ).resolves.toBe(0);

      // Status precondition violated — the concurrent-writer shape.
      const stale = await repository.updateIfStatus(deal.id, DealStatus.PAID, {
        status: DealStatus.CANCELLED,
      });
      expect(stale).toBe(0);
      const untouched = await repository.findById(deal.id);
      expect(untouched?.status).toBe(DealStatus.NEGOTIATING);
    });
  });

  describe('appendEvent + findEvents (the timeline)', () => {
    it('appends events and reads them back oldest first', async () => {
      const deal = await repository.create(createArgs()); // birth event at real now
      const t0 = new Date('2026-09-05T10:00:00.000Z');
      await repository.appendEvent({
        dealId: deal.id,
        actorId: 'buyer-1',
        fromStatus: DealStatus.NEGOTIATING,
        toStatus: DealStatus.AGREED,
        createdAt: new Date(t0.getTime() + 60_000),
      });
      // An informational, actorless event (the «پرداخت کردم» mark shape) —
      // stamped EARLIER than the birth event; the read must sort by createdAt.
      await repository.appendEvent({
        dealId: deal.id,
        actorId: null,
        fromStatus: DealStatus.NEGOTIATING,
        toStatus: DealStatus.NEGOTIATING,
        note: 'خریدار پرداخت را اعلام کرد',
        createdAt: t0,
      });

      const timeline = await repository.findEvents(deal.id);

      expect(timeline).toHaveLength(3);
      expect(timeline.map((event) => [event.toStatus, event.note])).toEqual([
        [DealStatus.NEGOTIATING, 'خریدار پرداخت را اعلام کرد'], // controlled t0
        [DealStatus.AGREED, null], // t0 + 1m
        [DealStatus.NEGOTIATING, null], // the birth event (real now — latest)
      ]);
    });

    it('scopes the timeline to one deal', async () => {
      const deal = await repository.create(createArgs());
      const other = await repository.create(createArgs({ code: 'OTHERCOD' }));

      await repository.appendEvent({
        dealId: deal.id,
        actorId: 'buyer-1',
        fromStatus: DealStatus.NEGOTIATING,
        toStatus: DealStatus.AGREED,
      });

      expect(await repository.findEvents(deal.id)).toHaveLength(2);
      expect(await repository.findEvents(other.id)).toHaveLength(1);
    });
  });
});
