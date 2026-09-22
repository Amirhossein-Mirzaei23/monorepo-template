import { DealStatus, LotStatus, UserStatus } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';
import { FakePrisma } from '../../../test/fakes/fake-prisma';
import { AdminOverviewRepository } from '../admin-overview.repository';
import { AdminOverviewService } from '../admin-overview.service';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Fixed system clock for the whole suite (the service anchors its window on one `now`). */
const FIXED_NOW = new Date('2026-09-22T12:00:00.000Z');

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
    expiresAt: new Date(createdAt.getTime() + 30 * DAY_MS),
    status,
    createdAt,
  };
}

describe('AdminOverviewService', () => {
  let fake: FakePrisma;
  let service: AdminOverviewService;

  beforeAll(() => {
    jest.useFakeTimers({ now: FIXED_NOW });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    fake = new FakePrisma();
    service = new AdminOverviewService(
      new AdminOverviewRepository(fake as unknown as PrismaService),
    );
  });

  describe('zero state', () => {
    it('reports all-zero counters and empty queues on an empty store', async () => {
      const overview = await service.getOverview();

      expect(overview).toEqual({
        counts: {
          pendingReviewLots: 0,
          openReports: 0,
          pendingVerifications: 0,
          disputedDeals: 0,
          activeUsers: 0,
          suspendedUsers: 0,
          blockedUsers: 0,
          newUsersLast7Days: 0,
        },
        oldestPendingLots: [],
        oldestOpenReports: [],
      });
    });
  });

  describe('counters', () => {
    it('derives every counter from the matching domain rows and no others', async () => {
      const now = new Date();
      await fake.seedLot(lotSeed(LotStatus.PENDING_REVIEW, now, 'queue-1'));
      await fake.seedLot(lotSeed(LotStatus.PENDING_REVIEW, now, 'queue-2'));
      await fake.seedLot(lotSeed(LotStatus.DRAFT, now, 'draft'));
      await fake.seedLot(lotSeed(LotStatus.ACTIVE, now, 'active'));

      const lot = fake.seedLot(lotSeed(LotStatus.SOLD, now, 'sold'));
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

      fake.seedUser({ phone: '09120000001', name: 'A', status: UserStatus.ACTIVE });
      fake.seedUser({ phone: '09120000002', name: 'B', status: UserStatus.SUSPENDED });
      fake.seedUser({ phone: '09120000003', name: 'C', status: UserStatus.BLOCKED });
      fake.seedUser({ phone: '09120000004', name: 'D', status: UserStatus.DELETED });

      const overview = await service.getOverview();

      expect(overview.counts).toEqual({
        pendingReviewLots: 2,
        // Hardcoded until the reports domain lands (Task 09).
        openReports: 0,
        // Hardcoded until the verification domain lands (Task 10).
        pendingVerifications: 0,
        disputedDeals: 1,
        activeUsers: 1,
        suspendedUsers: 1,
        blockedUsers: 1,
        newUsersLast7Days: 4,
      });
    });
  });

  describe('quick queues', () => {
    it('returns the five oldest pending lots oldest-first with summary fields only', async () => {
      const base = FIXED_NOW.getTime() - 10 * DAY_MS;
      for (let index = 7; index >= 1; index -= 1) {
        const createdAt = new Date(base + index * DAY_MS);
        await fake.seedLot(lotSeed(LotStatus.PENDING_REVIEW, createdAt, `queued-${index}`));
      }

      const overview = await service.getOverview();

      expect(overview.oldestPendingLots).toHaveLength(5);
      expect(overview.oldestPendingLots.map((lot) => lot.title)).toEqual([
        'queued-1',
        'queued-2',
        'queued-3',
        'queued-4',
        'queued-5',
      ]);
      for (const lot of overview.oldestPendingLots) {
        expect(Object.keys(lot).sort()).toEqual(['code', 'createdAt', 'id', 'status', 'title']);
        expect(lot.status).toBe(LotStatus.PENDING_REVIEW);
      }
    });

    it('keeps the open-reports queue empty until the reports domain lands (Task 09)', async () => {
      const overview = await service.getOverview();
      expect(overview.oldestOpenReports).toEqual([]);
    });
  });

  describe('7-day new-users window', () => {
    it('includes users created exactly 7 days ago and excludes older ones (consistent now)', async () => {
      fake.seedUser({
        phone: '09120000001',
        name: 'Boundary — exactly 7d',
        createdAt: new Date(FIXED_NOW.getTime() - 7 * DAY_MS),
      });
      fake.seedUser({
        phone: '09120000002',
        name: 'Outside — 7d minus 1ms',
        createdAt: new Date(FIXED_NOW.getTime() - 7 * DAY_MS - 1),
      });
      fake.seedUser({
        phone: '09120000003',
        name: 'Fresh',
        createdAt: new Date(FIXED_NOW.getTime() - DAY_MS),
      });

      const overview = await service.getOverview();

      expect(overview.counts.newUsersLast7Days).toBe(2);
    });

    it('anchors the window on one `now` captured for the whole read', async () => {
      fake.seedUser({
        phone: '09120000001',
        name: 'Just now',
      });

      const overview = await service.getOverview();
      expect(overview.counts.newUsersLast7Days).toBe(1);

      // The clock moved AFTER the read was captured — a stored overview of the
      // same rows keeps its shape (the window never straddles two `now`s).
      jest.setSystemTime(new Date(FIXED_NOW.getTime() + 8 * DAY_MS));
      const refetched = await service.getOverview();
      expect(refetched.counts.newUsersLast7Days).toBe(0);
    });
  });
});
