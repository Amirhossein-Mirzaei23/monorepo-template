import { LiquidationReason, LotCondition, LotStatus, PricingType } from '@prisma/client';
import type { Lot } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';
import { FakePrisma } from '../../../test/fakes/fake-prisma';
import { LotsRepository } from '../../lots/lots.repository';
import { LotExpiryService } from '../lot-expiry.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const BASE_TIME = new Date('2026-09-01T10:00:00.000Z');

/** Any field the fake's seeder accepts, all optional — tests override per case. */
type SeedLotOverrides = Partial<Parameters<FakePrisma['seedLot']>[0]>;

describe('LotExpiryService', () => {
  let fake: FakePrisma;
  let repository: LotsRepository;
  let service: LotExpiryService;

  /** Seed a sane ACTIVE lot; overrides control status/expiry per test. */
  const seedLot = (overrides: SeedLotOverrides = {}): Lot =>
    fake.seedLot({
      sellerId: 'seller-1',
      categoryId: 'cat-1',
      title: 'مجموعه پیراهن عمده',
      quantity: 20,
      availableQuantity: 20,
      minOrderQuantity: 5,
      pricingType: PricingType.FIXED,
      totalPrice: 20_000_000,
      unitPrice: 1_000_000,
      condition: LotCondition.GRADE_A,
      liquidationReason: LiquidationReason.OVERSTOCK,
      province: 'tehran',
      city: 'tehran',
      status: LotStatus.ACTIVE,
      expiresAt: new Date(BASE_TIME.getTime() + 7 * DAY_MS),
      ...overrides,
    });

  const statusOf = async (id: string): Promise<LotStatus> => {
    const lot = await fake.lot.findUnique({ where: { id } });
    if (!lot) {
      throw new Error(`lot ${id} missing`);
    }
    return lot.status;
  };

  beforeAll(() => {
    // Deterministic fake clock: repository.expireDue() stamps `new Date()`
    // internally, so "now" is pinned to BASE_TIME for every test.
    jest.useFakeTimers({ now: BASE_TIME });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    fake = new FakePrisma();
    repository = new LotsRepository(fake as unknown as PrismaService);
    service = new LotExpiryService(repository);
  });

  describe('expireDueLots', () => {
    it('flips only ACTIVE lots past expiresAt and returns their count', async () => {
      const due = seedLot({ title: 'due', expiresAt: new Date(BASE_TIME.getTime() - DAY_MS) });
      const fresh = seedLot({ title: 'fresh' });
      const paused = seedLot({
        title: 'paused-past',
        status: LotStatus.PAUSED,
        expiresAt: new Date(BASE_TIME.getTime() - DAY_MS),
      });
      const alreadyExpired = seedLot({
        title: 'already-expired',
        status: LotStatus.EXPIRED,
        expiresAt: new Date(BASE_TIME.getTime() - DAY_MS),
      });
      const removed = seedLot({
        title: 'removed-past',
        status: LotStatus.REMOVED,
        expiresAt: new Date(BASE_TIME.getTime() - DAY_MS),
        deletedAt: new Date(BASE_TIME.getTime() - 2 * DAY_MS),
      });

      const count = await service.expireDueLots();

      expect(count).toBe(1);
      await expect(statusOf(due.id)).resolves.toBe(LotStatus.EXPIRED);
      await expect(statusOf(fresh.id)).resolves.toBe(LotStatus.ACTIVE);
      await expect(statusOf(paused.id)).resolves.toBe(LotStatus.PAUSED);
      await expect(statusOf(alreadyExpired.id)).resolves.toBe(LotStatus.EXPIRED);
      await expect(statusOf(removed.id)).resolves.toBe(LotStatus.REMOVED);
    });

    it('uses the exact sweep predicate: status ACTIVE + expiresAt < now + deletedAt null', async () => {
      // Each non-matching row isolates one predicate arm:
      const future = seedLot({ title: 'future' }); // expiresAt lt fails
      const paused = seedLot({ title: 'paused', status: LotStatus.PAUSED }); // status fails
      // A soft-deleted lot whose status stamp was skipped (deletedAt fails —
      // the belt-and-braces arm; must never be swept back to EXPIRED).
      const softDeletedActive = seedLot({
        title: 'soft-deleted',
        expiresAt: new Date(BASE_TIME.getTime() - DAY_MS),
        deletedAt: new Date(BASE_TIME.getTime() - 2 * DAY_MS),
      });

      const count = await service.expireDueLots();

      expect(count).toBe(0);
      await expect(statusOf(future.id)).resolves.toBe(LotStatus.ACTIVE);
      await expect(statusOf(paused.id)).resolves.toBe(LotStatus.PAUSED);
      await expect(statusOf(softDeletedActive.id)).resolves.toBe(LotStatus.ACTIVE);
    });

    it('is idempotent: a lot expiring exactly at "now" is untouched (strict lt), second run reports 0', async () => {
      const exact = seedLot({ title: 'exact', expiresAt: new Date(BASE_TIME.getTime()) });
      const due = seedLot({ title: 'due', expiresAt: new Date(BASE_TIME.getTime() - DAY_MS) });

      await expect(service.expireDueLots()).resolves.toBe(1);
      await expect(service.expireDueLots()).resolves.toBe(0);

      await expect(statusOf(due.id)).resolves.toBe(LotStatus.EXPIRED);
      await expect(statusOf(exact.id)).resolves.toBe(LotStatus.ACTIVE);
    });

    it('swallows repository errors (logged, retried next hour) and returns 0', async () => {
      const failing = {
        expireDue: () => Promise.reject(new Error('db down')),
      } as unknown as LotsRepository;
      const failingService = new LotExpiryService(failing);

      await expect(failingService.expireDueLots()).resolves.toBe(0);
    });
  });

  describe('handleExpiryCron', () => {
    it('delegates to expireDueLots (the @Cron wrapper carries no logic of its own)', async () => {
      const delegate = jest.spyOn(service, 'expireDueLots').mockResolvedValueOnce(3);

      await expect(service.handleExpiryCron()).resolves.toBe(3);
      expect(delegate).toHaveBeenCalledTimes(1);
    });
  });
});
