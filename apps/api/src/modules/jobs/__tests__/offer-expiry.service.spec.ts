import {
  LiquidationReason,
  LotCondition,
  LotStatus,
  OfferStatus,
  PricingType,
} from '@prisma/client';
import type { Lot, Offer } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';
import { FakePrisma } from '../../../test/fakes/fake-prisma';
import { OffersRepository } from '../../offers/offers.repository';
import { OfferExpiryService } from '../offer-expiry.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const BASE_TIME = new Date('2026-09-01T10:00:00.000Z');

describe('OfferExpiryService', () => {
  let fake: FakePrisma;
  let repository: OffersRepository;
  let service: OfferExpiryService;
  let lotId: string;

  /** Seed a sane PENDING offer on the shared lot; overrides control status/expiry per test. */
  const seedOffer = (overrides: Partial<Parameters<FakePrisma['seedOffer']>[0]> = {}): Offer =>
    fake.seedOffer({
      lotId,
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      quantity: 5,
      unitPrice: 1_000_000,
      totalPrice: 5_000_000,
      status: OfferStatus.PENDING,
      // Default: comfortably inside the 72 h window (the fresh control row).
      expiresAt: new Date(BASE_TIME.getTime() + 3 * DAY_MS),
      ...overrides,
    });

  const rowOf = async (id: string): Promise<Offer> => {
    const offer = await fake.offer.findUnique({ where: { id } });
    if (!offer) {
      throw new Error(`offer ${id} missing`);
    }
    return offer;
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
    // Offers FK their lot (fake mirrors the FK) — one shared ACTIVE lot per test.
    const lot: Lot = fake.seedLot({
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
    });
    lotId = lot.id;
    repository = new OffersRepository(fake as unknown as PrismaService);
    service = new OfferExpiryService(repository);
  });

  describe('expireDueOffers', () => {
    it('flips only due PENDING offers to EXPIRED (decidedAt stamped) and returns their count', async () => {
      const due = seedOffer({ expiresAt: new Date(BASE_TIME.getTime() - DAY_MS) });
      const fresh = seedOffer({});
      const countered = seedOffer({
        status: OfferStatus.COUNTERED,
        expiresAt: new Date(BASE_TIME.getTime() - DAY_MS),
      });
      const accepted = seedOffer({
        status: OfferStatus.ACCEPTED,
        expiresAt: new Date(BASE_TIME.getTime() - DAY_MS),
      });
      const rejected = seedOffer({
        status: OfferStatus.REJECTED,
        expiresAt: new Date(BASE_TIME.getTime() - DAY_MS),
      });
      const cancelled = seedOffer({
        status: OfferStatus.CANCELLED,
        expiresAt: new Date(BASE_TIME.getTime() - DAY_MS),
      });

      const count = await service.expireDueOffers();

      expect(count).toBe(1);
      const expired = await rowOf(due.id);
      expect(expired.status).toBe(OfferStatus.EXPIRED);
      // The sweep IS the decision — decidedAt carries the same pinned "now".
      expect(expired.decidedAt).toEqual(BASE_TIME);
      await expect(rowOf(fresh.id)).resolves.toMatchObject({ status: OfferStatus.PENDING });
      await expect(rowOf(countered.id)).resolves.toMatchObject({
        status: OfferStatus.COUNTERED,
      });
      await expect(rowOf(accepted.id)).resolves.toMatchObject({ status: OfferStatus.ACCEPTED });
      await expect(rowOf(rejected.id)).resolves.toMatchObject({ status: OfferStatus.REJECTED });
      await expect(rowOf(cancelled.id)).resolves.toMatchObject({ status: OfferStatus.CANCELLED });
    });

    it('uses the exact sweep predicate: status PENDING + expiresAt < now', async () => {
      // Each non-matching row isolates one predicate arm:
      const future = seedOffer({}); // expiresAt lt fails
      const decided = seedOffer({
        status: OfferStatus.ACCEPTED,
        expiresAt: new Date(BASE_TIME.getTime() - DAY_MS),
      }); // status fails

      const count = await service.expireDueOffers();

      expect(count).toBe(0);
      const freshRow = await rowOf(future.id);
      expect(freshRow.status).toBe(OfferStatus.PENDING);
      expect(freshRow.decidedAt).toBeNull();
      await expect(rowOf(decided.id)).resolves.toMatchObject({ status: OfferStatus.ACCEPTED });
    });

    it('is idempotent: an offer expiring exactly at "now" is untouched (strict lt), second run reports 0', async () => {
      const exact = seedOffer({ expiresAt: new Date(BASE_TIME.getTime()) });
      const due = seedOffer({ expiresAt: new Date(BASE_TIME.getTime() - DAY_MS) });

      await expect(service.expireDueOffers()).resolves.toBe(1);
      await expect(service.expireDueOffers()).resolves.toBe(0);

      const dueRow = await rowOf(due.id);
      expect(dueRow.status).toBe(OfferStatus.EXPIRED);
      expect(dueRow.decidedAt).toEqual(BASE_TIME);
      // Strict `<`: the boundary offer stays live (the lazy OFR-002 guard
      // shares the same rule), decidedAt never stamped.
      const exactRow = await rowOf(exact.id);
      expect(exactRow.status).toBe(OfferStatus.PENDING);
      expect(exactRow.decidedAt).toBeNull();
    });

    it('swallows repository errors (logged, retried next hour) and returns 0', async () => {
      const failing = {
        expireDue: () => Promise.reject(new Error('db down')),
      } as unknown as OffersRepository;
      const failingService = new OfferExpiryService(failing);

      await expect(failingService.expireDueOffers()).resolves.toBe(0);
    });
  });

  describe('handleExpiryCron', () => {
    it('delegates to expireDueOffers (the @Cron wrapper carries no logic of its own)', async () => {
      const delegate = jest.spyOn(service, 'expireDueOffers').mockResolvedValueOnce(3);

      await expect(service.handleExpiryCron()).resolves.toBe(3);
      expect(delegate).toHaveBeenCalledTimes(1);
    });
  });
});
