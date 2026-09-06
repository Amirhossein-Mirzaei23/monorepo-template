import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { FakePrisma } from '../../../test/fakes/fake-prisma';
import { createTestApp } from '../../../test/utils/create-test-app';

/**
 * ONB-001 + PROF-001 controller e2e: PUT /profiles/onboarding (happy path +
 * idempotent re-submit + 400s), GET /profiles/me and PATCH /profiles/me, all
 * behind the global JWT guard. Logins go through the real OTP dev-mode flow so
 * the auth matrix (401s) is exercised against the production guard chain, not
 * a stub. Every login uses a fresh phone — OTP send caps are per phone (3/hour).
 */
describe('ProfilesController (e2e)', () => {
  let app: INestApplication;
  let prisma: FakePrisma;
  /** Hands out unique client IPs so per-IP @Throttle buckets stay isolated per test. */
  let ipCounter = 0;
  const nextIp = (): string => `10.1.${Math.floor(++ipCounter / 250)}.${(ipCounter % 250) + 1}`;
  /** Fresh phone per login: the OTP send cap (3/hour/phone) must never trip. */
  let phoneCounter = 0;
  const nextPhone = (): string => `0921${String(++phoneCounter).padStart(7, '0')}`;

  let apparel: { id: string };
  let fmcg: { id: string };

  /** Registers-or-logs-in by phone OTP (dev mode echoes the code) → bearer token. */
  async function login(phone: string): Promise<string> {
    const otp = await request(app.getHttpServer())
      .post('/auth/otp/request')
      .set('X-Forwarded-For', nextIp())
      .send({ phone })
      .expect(200);
    const response = await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .send({ phone, code: otp.body.devCode })
      .expect(200);
    return response.body.accessToken as string;
  }

  const validSellerBody = (categoryIds: string[]) => ({
    isBuyer: true,
    isSeller: true,
    displayName: 'مینا رضایی',
    businessName: 'تولیدی پوشاک مینا',
    province: 'isfahan',
    city: 'kashan',
    bio: 'تولید و عرضه عمده پوشاک',
    instagram: 'mina.apparel',
    website: 'https://mina-apparel.ir',
    sellerYearsActive: 6,
    sellerBusinessType: 'MANUFACTURER',
    sellerDescription: 'تولیدکننده پوشاک زنانه',
    interests: categoryIds,
  });

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.prisma;
    apparel = prisma.seedCategory({ nameFa: 'پوشاک', slug: 'apparel', sortOrder: 1 });
    prisma.seedCategory({
      nameFa: 'مردانه',
      slug: 'apparel-men',
      parentId: apparel.id,
      sortOrder: 1,
    });
    fmcg = prisma.seedCategory({ nameFa: 'کالا مصرفی', slug: 'fmcg', sortOrder: 2 });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('PUT /profiles/onboarding', () => {
    it('requires authentication (401 without a token)', async () => {
      await request(app.getHttpServer())
        .put('/profiles/onboarding')
        .send(validSellerBody([]))
        .expect(401);
    });

    it('completes onboarding in one call and reflects on /auth/me', async () => {
      const phone = nextPhone();
      const token = await login(phone);

      const response = await request(app.getHttpServer())
        .put('/profiles/onboarding')
        .set('Authorization', `Bearer ${token}`)
        .send(validSellerBody([apparel.id, fmcg.id]))
        .expect(200);

      expect(response.body.displayName).toBe('مینا رضایی');
      expect(response.body.isBuyer).toBe(true);
      expect(response.body.isSeller).toBe(true);
      expect(response.body.interests.map((i: { slug: string }) => i.slug)).toEqual([
        'apparel',
        'fmcg',
      ]);
      expect(response.body.verificationBadges).toEqual([]);
      expect(response.body.onboardingCompleted).toBe(true);

      const me = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(me.body.onboardingCompleted).toBe(true);
      expect(me.body.accountRoles).toEqual(['BUYER', 'SELLER']);
    });

    it('re-submitting is an idempotent update (200, never 409) that keeps the first completion date', async () => {
      const phone = nextPhone();
      const token = await login(phone);
      await request(app.getHttpServer())
        .put('/profiles/onboarding')
        .set('Authorization', `Bearer ${token}`)
        .send(validSellerBody([apparel.id]))
        .expect(200);

      const userAfterFirst = await prisma.user.findUnique({ where: { phone } });
      const firstCompletion = userAfterFirst?.onboardingCompletedAt;
      expect(firstCompletion).not.toBeNull();

      const response = await request(app.getHttpServer())
        .put('/profiles/onboarding')
        .set('Authorization', `Bearer ${token}`)
        .send({
          ...validSellerBody([fmcg.id]),
          isSeller: false,
          businessName: null,
          sellerYearsActive: null,
          sellerBusinessType: null,
          sellerDescription: null,
          displayName: 'آرمان ویرایش‌شده',
        })
        .expect(200);

      expect(response.body.displayName).toBe('آرمان ویرایش‌شده');
      expect(response.body.isSeller).toBe(false);
      expect(response.body.businessName).toBeNull();
      expect(response.body.interests.map((i: { slug: string }) => i.slug)).toEqual(['fmcg']);

      const userAfterResubmit = await prisma.user.findUnique({ where: { phone } });
      expect(userAfterResubmit?.onboardingCompletedAt?.getTime()).toBe(firstCompletion?.getTime());
      expect(userAfterResubmit?.accountRoles).toEqual(['BUYER']);
    });

    it.each([
      ['no role selected', { isBuyer: false, isSeller: false }],
      ['seller without businessName', { isSeller: true }],
      ['province without city', { isBuyer: true, province: 'tehran' }],
      ['city not in province', { isBuyer: true, province: 'tehran', city: 'kashan' }],
      ['unknown interest id', { isBuyer: true, interests: ['missing-id'] }],
    ])('rejects %s with 400 (service rules) and writes nothing', async (_label, overrides) => {
      const phone = nextPhone();
      const token = await login(phone);
      await request(app.getHttpServer())
        .put('/profiles/onboarding')
        .set('Authorization', `Bearer ${token}`)
        .send({
          isBuyer: true,
          isSeller: false,
          displayName: 'آرمان تهرانی',
          ...overrides,
        })
        .expect(400);
      const user = await prisma.user.findUnique({ where: { phone } });
      expect(user?.onboardingCompletedAt).toBeNull();
    });

    it.each([
      ['displayName too short', { displayName: 'آ' }],
      ['businessName over 80 chars', { isSeller: true, businessName: 'x'.repeat(81) }],
      ['bad instagram handle', { isBuyer: true, instagram: 'not valid!' }],
      // require_tld is off (intranet/dev hosts) — spaces are the clear reject.
      ['website not a URL', { isBuyer: true, website: 'not a url' }],
      [
        'bad sellerBusinessType',
        { isSeller: true, businessName: 'ok', sellerBusinessType: 'FACTORY' },
      ],
      [
        'over 10 interests',
        // Unique fake ids: the violated rule is the array cap (11 > 10), not
        // uniqueness — apparel.id is not available yet at collection time.
        { isBuyer: true, interests: Array.from({ length: 11 }, (_, i) => `cat-${i}`) },
      ],
    ])('rejects %s with 400 (DTO rules)', async (_label, overrides) => {
      const token = await login(nextPhone());
      await request(app.getHttpServer())
        .put('/profiles/onboarding')
        .set('Authorization', `Bearer ${token}`)
        .send({
          isBuyer: true,
          isSeller: false,
          displayName: 'آرمان تهرانی',
          businessName: 'بیزینس',
          ...overrides,
        })
        .expect(400);
    });

    it('rejects a malformed body with 400 and writes nothing', async () => {
      const token = await login(nextPhone());
      await request(app.getHttpServer())
        .put('/profiles/onboarding')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(400);
      await request(app.getHttpServer())
        .put('/profiles/onboarding')
        .set('Authorization', `Bearer ${token}`)
        .send({ garbage: true })
        .expect(400);
    });
  });

  describe('GET /profiles/me', () => {
    it('requires authentication (401 without a token)', async () => {
      await request(app.getHttpServer()).get('/profiles/me').expect(401);
    });

    it('returns 404 for a user that has not onboarded', async () => {
      const token = await login(nextPhone());
      await request(app.getHttpServer())
        .get('/profiles/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('returns the own-profile shape with no user PII', async () => {
      const token = await login(nextPhone());
      await request(app.getHttpServer())
        .put('/profiles/onboarding')
        .set('Authorization', `Bearer ${token}`)
        .send(validSellerBody([apparel.id]))
        .expect(200);

      const response = await request(app.getHttpServer())
        .get('/profiles/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(Object.keys(response.body).sort()).toEqual([
        'bio',
        'businessName',
        'city',
        'createdAt',
        'displayName',
        'id',
        'instagram',
        'interests',
        'isBuyer',
        'isSeller',
        'metrics',
        'onboardingCompleted',
        'province',
        'sellerBusinessType',
        'sellerDescription',
        'sellerYearsActive',
        'updatedAt',
        'userId',
        'verificationBadges',
        'website',
      ]);
      // Allowlist: the profile payload never carries phone/email/passwordHash.
      expect(response.body).not.toHaveProperty('phone');
      expect(response.body).not.toHaveProperty('email');
      expect(response.body).not.toHaveProperty('passwordHash');
      expect(response.body.verificationBadges).toEqual([]);
      expect(response.body.onboardingCompleted).toBe(true);
      expect(response.body.metrics).toEqual({
        successfulTransactions: 0,
        averageRating: null,
        ratingCount: 0,
        responseRateMinutes: null,
        cancellationRate: null,
        activeListings: 0,
      });
    });
  });

  describe('PATCH /profiles/me', () => {
    it('requires authentication (401 without a token)', async () => {
      await request(app.getHttpServer())
        .patch('/profiles/me')
        .send({ displayName: 'آرمان تهرانی' })
        .expect(401);
    });

    it('returns 404 for a user that has not onboarded', async () => {
      const token = await login(nextPhone());
      await request(app.getHttpServer())
        .patch('/profiles/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ displayName: 'آرمان تهرانی' })
        .expect(404);
    });

    it('persists a partial edit and leaves omitted fields untouched', async () => {
      const token = await login(nextPhone());
      await request(app.getHttpServer())
        .put('/profiles/onboarding')
        .set('Authorization', `Bearer ${token}`)
        .send(validSellerBody([apparel.id]))
        .expect(200);

      const response = await request(app.getHttpServer())
        .patch('/profiles/me')
        .set('Authorization', `Bearer ${token}`)
        .send({
          displayName: 'مینا ویرایش‌شده',
          bio: null,
          instagram: 'mina.updated',
          interests: [fmcg.id],
        })
        .expect(200);

      expect(response.body.displayName).toBe('مینا ویرایش‌شده');
      expect(response.body.bio).toBeNull();
      expect(response.body.instagram).toBe('mina.updated');
      // Untouched by the PATCH:
      expect(response.body.businessName).toBe('تولیدی پوشاک مینا');
      expect(response.body.province).toBe('isfahan');
      expect(response.body.isSeller).toBe(true);
      expect(response.body.interests.map((i: { slug: string }) => i.slug)).toEqual(['fmcg']);
      expect(response.body.metrics.activeListings).toBe(0);

      const reread = await request(app.getHttpServer())
        .get('/profiles/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(reread.body.displayName).toBe('مینا ویرایش‌شده');
    });

    it('adds the seller hat, syncs accountRoles on /auth/me and enforces businessName', async () => {
      const phone = nextPhone();
      const token = await login(phone);
      await request(app.getHttpServer())
        .put('/profiles/onboarding')
        .set('Authorization', `Bearer ${token}`)
        .send({
          isBuyer: true,
          isSeller: false,
          displayName: 'آرمان تهرانی',
        })
        .expect(200);

      // Adding the seller hat without a businessName is a 400.
      await request(app.getHttpServer())
        .patch('/profiles/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ isSeller: true })
        .expect(400);

      const response = await request(app.getHttpServer())
        .patch('/profiles/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ isSeller: true, businessName: 'کسب‌وکار آرمان' })
        .expect(200);
      expect(response.body.isSeller).toBe(true);
      expect(response.body.isBuyer).toBe(true);

      const me = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(me.body.accountRoles).toEqual(['BUYER', 'SELLER']);
    });

    it('rejects role removal with 400 and keeps history (never removes)', async () => {
      const phone = nextPhone();
      const token = await login(phone);
      await request(app.getHttpServer())
        .put('/profiles/onboarding')
        .set('Authorization', `Bearer ${token}`)
        .send({
          isBuyer: true,
          isSeller: false,
          displayName: 'آرمان تهرانی',
        })
        .expect(200);

      // Removing the only role:
      await request(app.getHttpServer())
        .patch('/profiles/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ isBuyer: false })
        .expect(400);

      // Removing one of two hats is refused the same way.
      await request(app.getHttpServer())
        .patch('/profiles/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ isSeller: true, businessName: 'کسب‌وکار آرمان' })
        .expect(200);
      await request(app.getHttpServer())
        .patch('/profiles/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ isBuyer: false })
        .expect(400);

      const me = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(me.body.accountRoles).toEqual(['BUYER', 'SELLER']);
    });

    it.each([
      ['displayName too short', { displayName: 'آ' }],
      ['bad instagram handle', { instagram: 'not valid!' }],
      ['website not a URL', { website: 'not a url' }],
      ['bad sellerBusinessType', { sellerBusinessType: 'FACTORY' }],
      ['over 10 interests', { interests: Array.from({ length: 11 }, (_, i) => `cat-${i}`) }],
    ])('rejects %s with 400 (DTO rules)', async (_label, overrides) => {
      const token = await login(nextPhone());
      await request(app.getHttpServer())
        .put('/profiles/onboarding')
        .set('Authorization', `Bearer ${token}`)
        .send({
          isBuyer: true,
          isSeller: false,
          displayName: 'آرمان تهرانی',
        })
        .expect(200);
      await request(app.getHttpServer())
        .patch('/profiles/me')
        .set('Authorization', `Bearer ${token}`)
        .send(overrides)
        .expect(400);
    });

    it.each([
      ['province without city (stored pair broken)', { city: null }],
      ['city not in province', { province: 'tehran', city: 'kashan' }],
      ['unknown interest id', { interests: ['missing-id'] }],
    ])('rejects %s with 400 (service rules) and writes nothing', async (_label, overrides) => {
      const token = await login(nextPhone());
      await request(app.getHttpServer())
        .put('/profiles/onboarding')
        .set('Authorization', `Bearer ${token}`)
        .send(validSellerBody([apparel.id]))
        .expect(200);

      await request(app.getHttpServer())
        .patch('/profiles/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ displayName: 'نباید ذخیره شود', ...overrides })
        .expect(400);

      const reread = await request(app.getHttpServer())
        .get('/profiles/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(reread.body.displayName).toBe('مینا رضایی');
    });
  });
});
