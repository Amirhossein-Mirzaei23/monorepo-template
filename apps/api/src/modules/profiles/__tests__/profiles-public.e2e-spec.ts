import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { FakePrisma } from '../../../test/fakes/fake-prisma';
import { createTestApp } from '../../../test/utils/create-test-app';

/**
 * MKT-004 controller e2e — GET /profiles/sellers, the public source of the
 * home «تأییدشده‌ها» strip: anonymous access, seller-only newest-first
 * listing, the allowlisted strip payload, the TRS-001 `verified=true`
 * placeholder (an empty list — never unverified sellers posing as trusted)
 * and the limit slice/cap/validation.
 */
describe('PublicProfilesController — GET /profiles/sellers (e2e)', () => {
  let app: INestApplication;
  let prisma: FakePrisma;

  let phoneCounter = 0;
  const nextPhone = (): string => `0931${String(++phoneCounter).padStart(7, '0')}`;

  /** Seeds one seller (user + profile) at a controlled recency position. */
  function seedSeller(
    displayName: string,
    options: {
      businessName?: string | null;
      createdAt?: Date;
      isSeller?: boolean;
      province?: string | null;
      city?: string | null;
    } = {},
  ): { profileId: string } {
    const user = prisma.seedUser({ phone: nextPhone(), name: displayName });
    const profile = prisma.seedProfile({
      userId: user.id,
      displayName,
      businessName: options.businessName ?? null,
      province: options.province ?? null,
      city: options.city ?? null,
      isBuyer: true,
      isSeller: options.isSeller ?? true,
      createdAt: options.createdAt,
    });
    return { profileId: profile.id };
  }

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.prisma;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('public access + listing shape', () => {
    it('is public — 200 with the { items } envelope and no auth', async () => {
      seedSeller('فروشنده تنها', { businessName: 'کسب‌وکار نمونه' });

      const response = await request(app.getHttpServer()).get('/profiles/sellers').expect(200);

      expect(response.body).toEqual({ items: expect.any(Array) });
      expect(response.body.items).toHaveLength(1);
    });

    it('lists SELLER profiles only, newest first, with the allowlisted strip payload', async () => {
      const oldest = seedSeller('قدیمی‌ترین', {
        businessName: 'کسب‌وکار کهنه',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      const middle = seedSeller('میانی', {
        businessName: 'کسب‌وکار میانی',
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
      });
      const newest = seedSeller('تازه‌ترین', {
        businessName: 'کسب‌وکار نو',
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
      });
      // A buyer-only profile never belongs on the seller strip:
      seedSeller('خریدار محض', { isSeller: false });

      const response = await request(app.getHttpServer()).get('/profiles/sellers').expect(200);

      const items = response.body.items as Array<Record<string, unknown>>;
      // (The fake store persists across the suite's tests — assert on the
      // profiles THIS test seeded, in their controlled recency order.)
      const seededIds = [newest.profileId, middle.profileId, oldest.profileId];
      const seeded = items.filter((item) => seededIds.includes(item.id as string));
      expect(seeded.map((item) => item.id)).toEqual(seededIds);
      expect(items.some((item) => item.displayName === 'خریدار محض')).toBe(false);

      // Allowlist: exactly the strip fields — no userId/PII/contact/metrics.
      for (const item of items) {
        expect(Object.keys(item).sort()).toEqual([
          'businessName',
          'city',
          'displayName',
          'id',
          'province',
          'verified',
        ]);
        expect(item).not.toHaveProperty('userId');
        expect(item).not.toHaveProperty('bio');
      }
      expect(seeded[0]).toMatchObject({
        id: newest.profileId,
        displayName: 'تازه‌ترین',
        businessName: 'کسب‌وکار نو',
      });
    });

    it('carries the TRS-001 placeholder verified:false on every item', async () => {
      seedSeller('فروشنده پلاس‌هولدر');

      const response = await request(app.getHttpServer()).get('/profiles/sellers').expect(200);

      const items = response.body.items as Array<{ verified: boolean }>;
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((item) => item.verified === false)).toBe(true);
    });
  });

  describe('verified filter (TRS-001 placeholder semantics)', () => {
    it('returns an EMPTY list for ?verified=true while verification does not exist', async () => {
      seedSeller('تأییدنشده اما فروشنده', { businessName: 'کسب‌وکار واقعی' });

      const response = await request(app.getHttpServer())
        .get('/profiles/sellers?verified=true')
        .expect(200);

      // The home strip renders only on a non-empty verified=true result, so
      // this is exactly what keeps it hidden until TRS-001 lands.
      expect(response.body).toEqual({ items: [] });
    });

    it('?verified=false behaves like the unfiltered listing', async () => {
      seedSeller('فروشنده فلز', { businessName: 'کسب‌وکار فلز' });

      const response = await request(app.getHttpServer())
        .get('/profiles/sellers?verified=false')
        .expect(200);

      const items = response.body.items as Array<{ displayName: string }>;
      expect(items.some((item) => item.displayName === 'فروشنده فلز')).toBe(true);
    });
  });

  describe('limit slice + validation', () => {
    it('slices with ?limit and defaults to 10', async () => {
      for (let index = 0; index < 3; index += 1) {
        seedSeller(`فروشنده حلقه ${index}`);
      }

      const sliced = await request(app.getHttpServer())
        .get('/profiles/sellers?limit=2')
        .expect(200);
      expect(sliced.body.items as unknown[]).toHaveLength(2);

      for (let index = 0; index < 9; index += 1) {
        seedSeller(`فروشنده انبوه ${index}`);
      }
      // 12 sellers exist now — the unfiltered call still stops at the default 10.
      const defaulted = await request(app.getHttpServer()).get('/profiles/sellers').expect(200);
      expect(defaulted.body.items).toHaveLength(10);
    });

    it.each([
      ['limit below the floor', '/profiles/sellers?limit=0'],
      ['limit above the cap (20)', '/profiles/sellers?limit=21'],
      ['non-numeric limit', '/profiles/sellers?limit=many'],
      ['non-boolean verified', '/profiles/sellers?verified=maybe'],
      ['unknown (non-whitelisted) param', '/profiles/sellers?foo=bar'],
    ])('rejects %s with 400', async (_label, url) => {
      await request(app.getHttpServer()).get(url).expect(400);
    });
  });
});
