import {
  LiquidationReason,
  LotCondition,
  LotStatus,
  OfferStatus,
  PricingType,
} from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';
import { FakePrisma } from '../../../test/fakes/fake-prisma';
import { OffersRepository } from '../offers.repository';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('OffersRepository (vs FakePrisma — data access only)', () => {
  let fake: FakePrisma;
  let repository: OffersRepository;
  let lotId: string;

  const seedOffer = (overrides: Partial<Parameters<FakePrisma['seedOffer']>[0]> = {}) =>
    fake.seedOffer({
      lotId,
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      quantity: 10,
      unitPrice: 2_000_000,
      totalPrice: 20_000_000,
      expiresAt: new Date(Date.now() + 3 * DAY_MS),
      ...overrides,
    });

  beforeEach(() => {
    fake = new FakePrisma();
    repository = new OffersRepository(fake as unknown as PrismaService);
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

  describe('create + findById', () => {
    it('persists the row and applies the DB defaults (PENDING, undecided, no note)', async () => {
      const created = await repository.create({
        lotId,
        buyerId: 'buyer-1',
        sellerId: 'seller-1',
        quantity: 10,
        unitPrice: 2_000_000,
        totalPrice: 20_000_000,
        expiresAt: new Date(Date.now() + 3 * DAY_MS),
      });

      const loaded = await repository.findById(created.id);
      expect(loaded).not.toBeNull();
      expect(loaded?.status).toBe(OfferStatus.PENDING);
      expect(loaded?.decidedAt).toBeNull();
      expect(loaded?.note).toBeNull();
      expect(loaded?.parentId).toBeNull();
      expect(loaded?.conversationId).toBeNull();
    });

    it('returns null for an unknown id', async () => {
      expect(await repository.findById('missing-id')).toBeNull();
    });
  });

  describe('update (status transitions)', () => {
    it('writes only the provided scalars and bumps updatedAt', async () => {
      const offer = await seedOffer();
      const before = await repository.findById(offer.id);
      const now = new Date();

      const updated = await repository.update(offer.id, {
        status: OfferStatus.ACCEPTED,
        decidedAt: now,
      });

      expect(updated.status).toBe(OfferStatus.ACCEPTED);
      expect(updated.decidedAt).toEqual(now);
      expect(updated.unitPrice).toBe(before?.unitPrice); // untouched
      expect(updated.quantity).toBe(before?.quantity);
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(before?.updatedAt.getTime() ?? 0);
    });

    it('throws for an unknown id (mirrors Prisma P2025)', async () => {
      await expect(
        repository.update('missing-id', { status: OfferStatus.ACCEPTED }),
      ).rejects.toThrow('FakePrisma: offer missing-id not found');
    });
  });

  describe('findSiblingsPending', () => {
    it('matches same lot + same buyer + PENDING, excluding the given offer', async () => {
      const self = await seedOffer();
      const sibling = await seedOffer();
      const otherBuyer = await seedOffer({ buyerId: 'buyer-2' });
      const decided = await seedOffer({
        status: OfferStatus.CANCELLED,
        decidedAt: new Date(),
      });

      const siblings = await repository.findSiblingsPending(lotId, 'buyer-1', self.id);

      expect(siblings.map((row) => row.id)).toEqual([sibling.id]); // not self,
      // not the other buyer's offer, not the decided one.
      expect(siblings).not.toContainEqual(expect.objectContaining({ id: self.id }));
      expect(siblings).not.toContainEqual(expect.objectContaining({ id: otherBuyer.id }));
      expect(siblings).not.toContainEqual(expect.objectContaining({ id: decided.id }));
    });

    it("scopes by lot (another lot's offers are not siblings)", async () => {
      const otherLotId = fake.seedLot({
        sellerId: 'seller-1',
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
      }).id;
      const self = await seedOffer();
      await seedOffer({ lotId: otherLotId });

      const siblings = await repository.findSiblingsPending(lotId, 'buyer-1', self.id);
      expect(siblings).toHaveLength(0);
    });
  });

  describe('findChain (walk parents)', () => {
    it('walks a three-link chain oldest-first', async () => {
      const root = await seedOffer();
      const child = await seedOffer({ parentId: root.id });
      const grandchild = await seedOffer({ parentId: child.id });

      const chain = await repository.findChain(grandchild.id);

      expect(chain.map((row) => row.id)).toEqual([root.id, child.id, grandchild.id]);
    });

    it('returns a single-element chain for a root offer and [] for an unknown id', async () => {
      const root = await seedOffer();

      expect((await repository.findChain(root.id)).map((row) => row.id)).toEqual([root.id]);
      expect(await repository.findChain('missing-id')).toEqual([]);
    });
  });
});
