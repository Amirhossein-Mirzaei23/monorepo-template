import { DealStatus, LotStatus, UserStatus } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';
import { FakePrisma } from '../../../test/fakes/fake-prisma';
import { AdminOverviewRepository } from '../admin-overview.repository';

/** Factory for minimal seedLot payloads (only the fields the overview reads). */
function lotSeed(status: LotStatus, createdAt: Date, title: string) {
  return {
    sellerId: 'seller-1',
    categoryId: 'cat-1',
    title,
    quantity: 1,
    availableQuantity: 1,
    minOrderQuantity: 1,
    pricingType: 'FIXED' as const,
    totalPrice: 1000,
    unitPrice: 1000,
    condition: 'NEW' as const,
    liquidationReason: 'OVERSTOCK' as const,
    province: 'tehran',
    city: 'tehran',
    expiresAt: new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000),
    status,
    createdAt,
  };
}

describe('AdminOverviewRepository', () => {
  let fake: FakePrisma;
  let repository: AdminOverviewRepository;

  beforeEach(() => {
    fake = new FakePrisma();
    repository = new AdminOverviewRepository(fake as unknown as PrismaService);
  });

  describe('countLotsByStatus', () => {
    it('counts only the requested status (zero-state: 0 on an empty store)', async () => {
      await expect(repository.countLotsByStatus(LotStatus.PENDING_REVIEW)).resolves.toBe(0);

      const now = new Date();
      await fake.seedLot(lotSeed(LotStatus.PENDING_REVIEW, now, 'pending-1'));
      await fake.seedLot(lotSeed(LotStatus.PENDING_REVIEW, now, 'pending-2'));
      // Other statuses must not leak into the counter.
      await fake.seedLot(lotSeed(LotStatus.DRAFT, now, 'draft'));
      await fake.seedLot(lotSeed(LotStatus.ACTIVE, now, 'active'));
      await fake.seedLot(lotSeed(LotStatus.REJECTED, now, 'rejected'));

      await expect(repository.countLotsByStatus(LotStatus.PENDING_REVIEW)).resolves.toBe(2);
    });
  });

  describe('countDealsByStatus', () => {
    it('counts only DISPUTED deals (zero-state: 0 on an empty store)', async () => {
      await expect(repository.countDealsByStatus(DealStatus.DISPUTED)).resolves.toBe(0);

      const lot = fake.seedLot(lotSeed(LotStatus.SOLD, new Date(), 'sold-lot'));
      await fake.seedDeal({
        lotId: lot.id,
        buyerId: 'buyer-1',
        sellerId: 'seller-1',
        quantity: 1,
        unitPrice: 1000,
        totalPrice: 1000,
        deliveryMethod: 'PICKUP',
        paymentMethod: 'CASH',
        status: DealStatus.DISPUTED,
      });
      await fake.seedDeal({
        lotId: lot.id,
        buyerId: 'buyer-1',
        sellerId: 'seller-1',
        quantity: 1,
        unitPrice: 1000,
        totalPrice: 1000,
        deliveryMethod: 'PICKUP',
        paymentMethod: 'CASH',
        status: DealStatus.COMPLETED,
      });

      await expect(repository.countDealsByStatus(DealStatus.DISPUTED)).resolves.toBe(1);
    });
  });

  describe('countUsersByStatus', () => {
    it('counts ACTIVE/SUSPENDED/BLOCKED separately and ignores DELETED', async () => {
      await expect(repository.countUsersByStatus(UserStatus.ACTIVE)).resolves.toBe(0);

      fake.seedUser({ phone: '09120000001', name: 'A', status: UserStatus.ACTIVE });
      fake.seedUser({ phone: '09120000002', name: 'B', status: UserStatus.ACTIVE });
      fake.seedUser({ phone: '09120000003', name: 'C', status: UserStatus.SUSPENDED });
      fake.seedUser({ phone: '09120000004', name: 'D', status: UserStatus.BLOCKED });
      fake.seedUser({ phone: '09120000005', name: 'E', status: UserStatus.DELETED });

      await expect(repository.countUsersByStatus(UserStatus.ACTIVE)).resolves.toBe(2);
      await expect(repository.countUsersByStatus(UserStatus.SUSPENDED)).resolves.toBe(1);
      await expect(repository.countUsersByStatus(UserStatus.BLOCKED)).resolves.toBe(1);
    });
  });

  describe('countUsersCreatedSince', () => {
    it('counts only rows with createdAt >= since (inclusive lower bound)', async () => {
      const since = new Date('2026-09-15T00:00:00.000Z');
      fake.seedUser({ phone: '09120000001', name: 'Old', createdAt: new Date('2026-09-01') });
      fake.seedUser({ phone: '09120000002', name: 'Edge', createdAt: since });
      fake.seedUser({ phone: '09120000003', name: 'New', createdAt: new Date('2026-09-20') });

      await expect(repository.countUsersCreatedSince(since)).resolves.toBe(2);
    });
  });

  describe('findOldestLotsByStatus', () => {
    it('returns at most `take` lots, oldest first, only for the requested status', async () => {
      const base = new Date('2026-09-01T00:00:00.000Z');
      const day = 24 * 60 * 60 * 1000;
      for (let index = 9; index >= 1; index -= 1) {
        await fake.seedLot(
          lotSeed(LotStatus.PENDING_REVIEW, new Date(base.getTime() + index * day), `lot-${index}`),
        );
      }
      // A lot of another status must never enter the queue — even when it is
      // the oldest row in the store.
      await fake.seedLot(
        lotSeed(LotStatus.ACTIVE, new Date(base.getTime() - day), 'active-old-blocker'),
      );

      const rows = await repository.findOldestLotsByStatus(LotStatus.PENDING_REVIEW, 5);

      expect(rows).toHaveLength(5);
      expect(rows.map((row) => row.title)).toEqual(['lot-1', 'lot-2', 'lot-3', 'lot-4', 'lot-5']);
    });

    it('returns the minimal summary fields per row (id/code/title/status/createdAt)', async () => {
      const createdAt = new Date('2026-09-01T00:00:00.000Z');
      const seeded = await fake.seedLot(lotSeed(LotStatus.PENDING_REVIEW, createdAt, 'queued lot'));

      const [row] = await repository.findOldestLotsByStatus(LotStatus.PENDING_REVIEW, 5);

      expect(row).toMatchObject({
        id: seeded.id,
        code: seeded.code,
        title: 'queued lot',
        status: LotStatus.PENDING_REVIEW,
        createdAt,
      });
    });

    it('returns an empty array when nothing is pending (zero-state)', async () => {
      await expect(repository.findOldestLotsByStatus(LotStatus.PENDING_REVIEW, 5)).resolves.toEqual(
        [],
      );
    });
  });
});
