import type { INestApplication } from '@nestjs/common';
import {
  LiquidationReason,
  LotCondition,
  LotStatus,
  LotUnit,
  PricingType,
  UserStatus,
} from '@prisma/client';
import request from 'supertest';
import type { FakePrisma } from '../../../test/fakes/fake-prisma';
import { createTestApp } from '../../../test/utils/create-test-app';

/**
 * PROF-002 controller e2e — GET /profiles/sellers/:id, the public seller
 * profile page payload: anonymous access, the UNIFORM 404 (unknown id /
 * non-seller / non-ACTIVE user — no oracle for why a page is gone), the
 * strict payload allowlist (no phone/email/exactAddress/instagram/website
 * anywhere, TRS/PROF placeholders hard-coded), the ACTIVE-lots category
 * aggregation (count desc → nameFa) and the active/sold split (card shapes,
 * limits, SOLD ordering by soldAt).
 */
describe('PublicProfilesController — GET /profiles/sellers/:id (e2e)', () => {
  let app: INestApplication;
  let prisma: FakePrisma;

  let phoneCounter = 0;
  const nextPhone = (): string => `0931${String(++phoneCounter).padStart(7, '0')}`;

  let apparel: { id: string };
  let shoes: { id: string };
  let cosmetics: { id: string };

  /** Seeds one seller (user + profile) with the given account status/roles. */
  function seedSeller(
    displayName: string,
    options: {
      status?: UserStatus;
      accountRoles?: ('BUYER' | 'SELLER')[];
      businessName?: string | null;
      bio?: string | null;
      province?: string | null;
      city?: string | null;
      withEmail?: boolean;
    } = {},
  ): { userId: string; profileId: string; phone: string; createdAt: Date } {
    const email = options.withEmail ? 'seller@example.com' : null;
    const accountRoles = options.accountRoles ?? ['BUYER', 'SELLER'];
    const user = prisma.seedUser({
      phone: nextPhone(),
      name: displayName,
      email,
      status: options.status ?? UserStatus.ACTIVE,
      accountRoles: accountRoles as never,
    });
    const profile = prisma.seedProfile({
      userId: user.id,
      displayName,
      businessName: options.businessName ?? null,
      bio: options.bio ?? null,
      province: options.province ?? null,
      city: options.city ?? null,
      isBuyer: accountRoles.includes('BUYER'),
      isSeller: accountRoles.includes('SELLER'),
    });
    return { userId: user.id, profileId: profile.id, phone: user.phone, createdAt: user.createdAt };
  }

  let lotSeq = 0;

  /** Seeds one lot of the seller with controlled status/timing/category. */
  function seedSellerLot(
    sellerId: string,
    overrides: Partial<Parameters<FakePrisma['seedLot']>[0]> = {},
  ) {
    lotSeq += 1;
    return prisma.seedLot({
      sellerId,
      categoryId: apparel.id,
      title: `عمده لات شماره ${lotSeq}`,
      quantity: 10,
      availableQuantity: 10,
      minOrderQuantity: 1,
      pricingType: PricingType.FIXED,
      totalPrice: 1_000_000,
      unitPrice: 100_000,
      condition: LotCondition.GRADE_A,
      liquidationReason: LiquidationReason.OVERSTOCK,
      unit: LotUnit.PIECE,
      province: 'tehran',
      city: 'tehran',
      exactAddress: 'تهران، خیابان مخفی، پلاک ۱۲',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      status: LotStatus.ACTIVE, // seller-page default; overrides win
      ...overrides,
    });
  }

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.prisma;
    apparel = prisma.seedCategory({ nameFa: 'پوشاک', slug: 'apparel', sortOrder: 1 });
    shoes = prisma.seedCategory({ nameFa: 'کفش', slug: 'shoes', sortOrder: 2 });
    cosmetics = prisma.seedCategory({ nameFa: 'آرایشی بهداشتی', slug: 'cosmetics', sortOrder: 3 });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('public access + payload allowlist', () => {
    it('is public — 200 with the full page payload and no auth', async () => {
      const seller = seedSeller('مینا رضایی', {
        businessName: 'تولیدی پوشاک مینا',
        bio: 'عمده‌فروشی پوشاک با ۱۰ سال سابقه',
        province: 'isfahan',
        city: 'kashan',
        withEmail: true,
      });

      const response = await request(app.getHttpServer())
        .get(`/profiles/sellers/${seller.profileId}`)
        .expect(200);

      const body = response.body as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual([
        'activeLots',
        'badges',
        'bio',
        'businessName',
        'categories',
        'city',
        'displayName',
        'id',
        'memberSince',
        'metrics',
        'province',
        'soldLots',
        'verified',
      ]);
      expect(body.id).toBe(seller.profileId);
      expect(body.businessName).toBe('تولیدی پوشاک مینا');
      // fa labels resolved server-side via iran-geo (PROF-002 convention).
      expect(body.province).toBe('اصفهان');
      expect(body.city).toBe('کاشان');
    });

    it('carries the TRS/PROF placeholders (verified:false, badges:[], metrics zeros/nulls)', async () => {
      const seller = seedSeller('فروشنده پلاس‌هولدر');

      const response = await request(app.getHttpServer())
        .get(`/profiles/sellers/${seller.profileId}`)
        .expect(200);

      const body = response.body as Record<string, unknown>;
      expect(body.verified).toBe(false);
      expect(body.badges).toEqual([]);
      expect(body.metrics).toEqual({
        successfulTransactions: 0,
        ratingAverage: null,
        ratingCount: 0,
        responseRateMinutes: null,
        cancellationRate: 0,
      });
      expect(new Date(body.memberSince as string).toISOString()).toBe(
        seller.createdAt.toISOString(),
      );
    });

    it('leaks NO private/contact fields anywhere in the payload (exactAddress, phone, email, seller extras)', async () => {
      const seller = seedSeller('فروشنده خصوصی', {
        businessName: 'کسب‌وکار خصوصی',
        withEmail: true,
      });
      seedSellerLot(seller.userId); // exactAddress is set on every seeded lot

      const response = await request(app.getHttpServer())
        .get(`/profiles/sellers/${seller.profileId}`)
        .expect(200);

      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain('exactAddress');
      expect(serialized).not.toContain('locationHint');
      expect(serialized).not.toContain('rejectionReason');
      expect(serialized).not.toContain('instagram');
      expect(serialized).not.toContain('website');
      // The seller's own contact values never surface (no User join in the payload).
      expect(serialized).not.toContain(seller.phone.slice(0, 6));
      expect(serialized).not.toContain('seller@example.com');
    });
  });

  describe('uniform 404 — no oracle', () => {
    it('404s an unknown profile id', async () => {
      const response = await request(app.getHttpServer())
        .get('/profiles/sellers/clxdoesnotexist000000')
        .expect(404);
      expect(response.body.message).toBe('Seller not found');
    });

    it('404s a buyer-only profile (no SELLER role)', async () => {
      const buyer = seedSeller('خریدار محض', { accountRoles: ['BUYER'] });
      const response = await request(app.getHttpServer())
        .get(`/profiles/sellers/${buyer.profileId}`)
        .expect(404);
      expect(response.body.message).toBe('Seller not found');
    });

    it('404s a suspended seller (user status not ACTIVE) — same message as unknown', async () => {
      const suspended = seedSeller('فروشنده تعلیق‌شده', { status: UserStatus.SUSPENDED });
      const response = await request(app.getHttpServer())
        .get(`/profiles/sellers/${suspended.profileId}`)
        .expect(404);
      expect(response.body.message).toBe('Seller not found');
    });

    it('404s a soft-deleted seller (status DELETED)', async () => {
      const deleted = seedSeller('فروشنده حذف‌شده', { status: UserStatus.DELETED });
      await request(app.getHttpServer()).get(`/profiles/sellers/${deleted.profileId}`).expect(404);
    });
  });

  describe('categories aggregation (visible ACTIVE lots only)', () => {
    it('aggregates distinct categories count desc, nameFa tiebreak, ignoring non-ACTIVE lots', async () => {
      const seller = seedSeller('فروشنده دسته‌بندی‌دار');
      // پوشاک ×2, کفش ×1, آرایشی ×1 (tie with کفش — آرایشی wins on nameFa)
      seedSellerLot(seller.userId, { categoryId: apparel.id });
      seedSellerLot(seller.userId, { categoryId: apparel.id });
      seedSellerLot(seller.userId, { categoryId: shoes.id });
      seedSellerLot(seller.userId, { categoryId: cosmetics.id });
      // None of these count: DRAFT, SOLD, EXPIRED, removed.
      seedSellerLot(seller.userId, { categoryId: shoes.id, status: LotStatus.DRAFT });
      seedSellerLot(seller.userId, { categoryId: shoes.id, status: LotStatus.SOLD });
      seedSellerLot(seller.userId, { categoryId: shoes.id, status: LotStatus.EXPIRED });

      const response = await request(app.getHttpServer())
        .get(`/profiles/sellers/${seller.profileId}`)
        .expect(200);

      const categories = (response.body as { categories: Array<{ nameFa: string }> }).categories;
      expect(categories.map((category) => category.nameFa)).toEqual([
        'پوشاک',
        'آرایشی بهداشتی',
        'کفش',
      ]);
      for (const category of categories) {
        expect(Object.keys(category).sort()).toEqual(['id', 'nameFa', 'slug']);
      }
    });

    it('returns [] categories for a seller without lots', async () => {
      const seller = seedSeller('فروشنده بی‌لات');
      const response = await request(app.getHttpServer())
        .get(`/profiles/sellers/${seller.profileId}`)
        .expect(200);
      expect((response.body as { categories: unknown[] }).categories).toEqual([]);
    });
  });

  describe('active/sold split (card envelopes)', () => {
    it('returns page 1 of ACTIVE lots (limit 12, newest first) and up to 4 SOLD by newest soldAt', async () => {
      const seller = seedSeller('فروشنده پرکار');
      // 13 ACTIVE (limit 12) — staggered createdAt, index 0 is the newest.
      const active = [...Array(13).keys()].map((index) =>
        seedSellerLot(seller.userId, {
          createdAt: new Date(Date.now() - index * 60_000),
        }),
      );
      // 5 SOLD (limit 4) — soldAt newest first; the oldest one must drop off.
      const sold = [...Array(5).keys()].map((index) =>
        seedSellerLot(seller.userId, {
          status: LotStatus.SOLD,
          soldAt: new Date(Date.now() - (index + 100) * 60_000),
          createdAt: new Date(Date.now() - (index + 200) * 60_000),
        }),
      );

      const response = await request(app.getHttpServer())
        .get(`/profiles/sellers/${seller.profileId}`)
        .expect(200);

      const body = response.body as {
        activeLots: {
          items: Array<Record<string, unknown>>;
          total: number;
          page: number;
          limit: number;
        };
        soldLots: {
          items: Array<Record<string, unknown>>;
          total: number;
          page: number;
          limit: number;
        };
      };

      expect(body.activeLots.total).toBe(13);
      expect(body.activeLots.page).toBe(1);
      expect(body.activeLots.limit).toBe(12);
      expect(body.activeLots.items).toHaveLength(12);
      // Newest listing first; the 13th (oldest) dropped off page 1.
      expect(body.activeLots.items[0]?.code).toBe(active[0]?.code);
      expect(body.activeLots.items[11]?.code).toBe(active[11]?.code);
      expect(body.activeLots.items.some((lot) => lot.code === active[12]?.code)).toBe(false);

      expect(body.soldLots.total).toBe(5);
      expect(body.soldLots.limit).toBe(4);
      expect(body.soldLots.items).toHaveLength(4);
      // Newest sale first; the oldest SOLD lot dropped off.
      expect(body.soldLots.items[0]?.code).toBe(sold[0]?.code);
      expect(body.soldLots.items.some((lot) => lot.code === sold[4]?.code)).toBe(false);

      // MKT-001 card shape, allowlisted (no privacy fields, hard-false verifiedSeller).
      const card = body.activeLots.items[0] as Record<string, unknown>;
      expect(Object.keys(card).sort()).toEqual([
        'availableQuantity',
        'city',
        'code',
        'condition',
        'coverThumbUrl',
        'createdAt',
        'expiresAt',
        'id',
        'province',
        'quantity',
        'seller',
        'title',
        'totalPrice',
        'unit',
        'unitPrice',
        'updatedAt',
        'verifiedSeller',
      ]);
      expect(card.verifiedSeller).toBe(false);
      expect(card.seller).toMatchObject({ id: seller.userId });
      expect(card.coverThumbUrl).toBeNull(); // no cover media seeded

      // The two lists never mix states.
      for (const soldLot of body.soldLots.items) {
        expect(body.activeLots.items.some((lot) => lot.code === soldLot.code)).toBe(false);
      }
    });

    it('hides an ACTIVE lot past its expiry from activeLots (visibility core)', async () => {
      const seller = seedSeller('فروشنده منقضی');
      seedSellerLot(seller.userId, {
        expiresAt: new Date(Date.now() - 60_000), // past — sweep has not flipped it yet
      });

      const response = await request(app.getHttpServer())
        .get(`/profiles/sellers/${seller.profileId}`)
        .expect(200);

      const body = response.body as { activeLots: { items: unknown[]; total: number } };
      expect(body.activeLots.total).toBe(0);
      expect(body.activeLots.items).toEqual([]);
    });

    it('returns empty envelopes for a seller without lots (both empty states)', async () => {
      const seller = seedSeller('فروشنده تازه‌کار');
      const response = await request(app.getHttpServer())
        .get(`/profiles/sellers/${seller.profileId}`)
        .expect(200);
      const body = response.body as {
        activeLots: { items: unknown[]; total: number };
        soldLots: { items: unknown[]; total: number };
      };
      expect(body.activeLots).toEqual({ items: [], total: 0, page: 1, limit: 12 });
      expect(body.soldLots).toEqual({ items: [], total: 0, page: 1, limit: 4 });
    });
  });
});
