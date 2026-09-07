import type { INestApplication } from '@nestjs/common';
import { LiquidationReason, LotCondition, LotStatus, MediaType, PricingType } from '@prisma/client';
import sharp from 'sharp';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import type { FakePrisma } from '../../../test/fakes/fake-prisma';
import { createTestApp } from '../../../test/utils/create-test-app';
import { LOT_ACTIONS, type LotAction } from '../lots.constants';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Near-past-the-hill expiry for refresh assertions (submit). */
const soonExpiry = (): Date => new Date(Date.now() + 2 * DAY_MS);

/**
 * Lots controller e2e: LOT-002 (POST /lots + PATCH /lots/:id) and LOT-003
 * (POST /lots/:id/submit|pause|resume|mark-sold|duplicate + DELETE /lots/:id)
 * behind the global JWT guard, exercised against the real guard chain (auth
 * via the dev-mode OTP flow, like the profiles suites). Covers: 401 anonymous,
 * 403 non-seller (SELLER_REQUIRED), 403 non-owner, 409 ILLEGAL_STATUS_EDIT /
 * ILLEGAL_TRANSITION / EXPIRED, 400 validation (DTO + service rules), the
 * draft→edit→submit flow, the ACTIVE price-only edit rule with unitPrice
 * re-derivation, the owner-shape allowlist (response CONTAINS exactAddress/
 * rejectionReason; exact key set), and the full LOT-003 lifecycle incl.
 * illegal moves rejected and the soft-delete behaviour.
 * MKT-001: the public listing GET /lots — anonymous access, ACTIVE-only +
 * expiry safety predicate, the full sort allowlist, pagination caps, and the
 * card payload allowlist (exact key set, no exactAddress/rejectionReason/
 * locationHint, cover thumb, seller summary, verifiedSeller placeholder).
 * MKT-002: the filter params — every filter selects alone, filters compose,
 * invalid enum members and out-of-bounds numbers are 400, inverted bounds are
 * ignored-safe (200, empty), and `verifiedSeller` is rejected (deferred to
 * TRS-001).
 * MKT-003: the `q` search param — «تیشرت» finds «تی‌شرت» (ZWNJ/digit/char
 * normalization on both sides), businessName and category-nameFa relation
 * arms, search+filter+sort composition, relevance (title-prefix first) on the
 * default sort with explicit sort overriding, honest empty pages, and the
 * length bounds (400, SEARCH_QUERY_TOO_SHORT below 2 chars).
 */
describe('LotsController (e2e)', () => {
  let app: INestApplication;
  let prisma: FakePrisma;
  let storageRoot: string;
  /** Hands out unique client IPs so per-IP @Throttle buckets stay isolated per test. */
  let ipCounter = 0;
  const nextIp = (): string => `10.2.${Math.floor(++ipCounter / 250)}.${(ipCounter % 250) + 1}`;
  /** Fresh phone per login: the OTP send cap (3/hour/phone) must never trip. */
  let phoneCounter = 0;
  const nextPhone = (): string => `0931${String(++phoneCounter).padStart(7, '0')}`;

  let parent: { id: string };
  let child: { id: string };
  let otherChild: { id: string };

  /** Registers-or-logs-in by phone OTP (dev mode echoes the code) → bearer token.
   * The verify hop gets its own per-IP bucket like otp/request — LOT-005 grew
   * the suite past the shared 100 req/min global throttle budget. */
  async function login(phone: string): Promise<string> {
    const otp = await request(app.getHttpServer())
      .post('/auth/otp/request')
      .set('X-Forwarded-For', nextIp())
      .send({ phone })
      .expect(200);
    const response = await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .set('X-Forwarded-For', nextIp())
      .send({ phone, code: otp.body.devCode })
      .expect(200);
    return response.body.accessToken as string;
  }

  /** Login + grant the SELLER hat directly in the store (ONB-001 does it via onboarding). */
  async function loginAsSeller(): Promise<{ token: string; userId: string }> {
    const phone = nextPhone();
    const token = await login(phone);
    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user) {
      throw new Error('loginAsSeller: user row missing after OTP verify');
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { accountRoles: ['SELLER'] },
    });
    return { token, userId: user.id };
  }

  const validLotBody = (categoryId: string, overrides: Record<string, unknown> = {}) => ({
    title: 'عمده پیراهن مردانه — ۵۰ عدد',
    description: 'توضیحات کامل لات برای تست',
    categoryId,
    quantity: 50,
    minOrderQuantity: 10,
    totalPrice: 112_500_000, // unitPrice → round(112_500_000 / 50) = 2_250_000
    pricingType: PricingType.NEGOTIABLE,
    condition: LotCondition.GRADE_A,
    liquidationReason: LiquidationReason.OVERSTOCK,
    province: 'tehran',
    city: 'tehran',
    locationHint: 'بازار بزرگ تهران',
    exactAddress: 'تهران، خیابان …، پلاک ۱۲',
    ...overrides,
  });

  const seedLot = (
    sellerId: string,
    overrides: Partial<Parameters<FakePrisma['seedLot']>[0]> = {},
  ) =>
    prisma.seedLot({
      sellerId,
      categoryId: parent.id,
      subcategoryId: child.id,
      title: 'مجموعه تیشرت تن‌پوش عمده',
      quantity: 10,
      availableQuantity: 10,
      minOrderQuantity: 5,
      pricingType: PricingType.FIXED,
      totalPrice: 1_000_000,
      unitPrice: 100_000,
      condition: LotCondition.GRADE_A,
      liquidationReason: LiquidationReason.OVERSTOCK,
      province: 'tehran',
      city: 'tehran',
      status: LotStatus.DRAFT,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      ...overrides,
    });

  beforeAll(async () => {
    // MEDIA-005 suites upload through the real POST /media pipeline — bytes go
    // to a throwaway local-disk root (set BEFORE boot, like the media specs).
    storageRoot = await mkdtemp(join(tmpdir(), 'lots-media-e2e-'));
    process.env.STORAGE_DIR = storageRoot;
    const testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.prisma;
    parent = prisma.seedCategory({ nameFa: 'پوشاک', slug: 'apparel-lots', sortOrder: 1 });
    child = prisma.seedCategory({
      nameFa: 'مردانه',
      slug: 'apparel-men-lots',
      parentId: parent.id,
      sortOrder: 1,
    });
    otherChild = prisma.seedCategory({
      nameFa: 'ورزشی',
      slug: 'shoes-sport-lots',
      parentId: prisma.seedCategory({ nameFa: 'کفش', slug: 'shoes-lots', sortOrder: 2 }).id,
      sortOrder: 1,
    });
  });

  afterAll(async () => {
    await app.close();
    await rm(storageRoot, { recursive: true, force: true });
    delete process.env.STORAGE_DIR;
  });

  describe('POST /lots', () => {
    it('requires authentication (401 without a token)', async () => {
      await request(app.getHttpServer()).post('/lots').send(validLotBody(parent.id)).expect(401);
    });

    it('rejects a buyer-only account with 403 + code SELLER_REQUIRED', async () => {
      const token = await login(nextPhone()); // fresh account: no SELLER hat
      const response = await request(app.getHttpServer())
        .post('/lots')
        .set('Authorization', `Bearer ${token}`)
        .send(validLotBody(parent.id))
        .expect(403);
      expect(response.body.code).toBe('SELLER_REQUIRED');
    });

    it('creates a DRAFT by default with derived fields (unitPrice, defaults, +30d expiry)', async () => {
      const { token } = await loginAsSeller();
      const before = Date.now();

      const response = await request(app.getHttpServer())
        .post('/lots')
        .set('Authorization', `Bearer ${token}`)
        .send(validLotBody(parent.id))
        .expect(201);

      expect(response.body.status).toBe('DRAFT');
      expect(response.body.code).toHaveLength(8);
      expect(response.body.unitPrice).toBe(2_250_000);
      expect(response.body.unit).toBe('PIECE'); // unit default
      expect(response.body.availableQuantity).toBe(50); // defaults to quantity
      expect(response.body.minOrderQuantity).toBe(10);
      expect(response.body.locationHint).toBe('بازار بزرگ تهران');
      const expiry = new Date(response.body.expiresAt).getTime() - before;
      expect(expiry).toBeGreaterThanOrEqual(30 * 24 * 60 * 60 * 1000 - 1_000);
      expect(expiry).toBeLessThanOrEqual(30 * 24 * 60 * 60 * 1000 + 5_000);
    });

    it('creates a PENDING_REVIEW lot when submit=true', async () => {
      const { token } = await loginAsSeller();
      const response = await request(app.getHttpServer())
        .post('/lots')
        .set('Authorization', `Bearer ${token}`)
        .send(validLotBody(parent.id, { submit: true }))
        .expect(201);
      expect(response.body.status).toBe('PENDING_REVIEW');
    });

    it('returns the OWNER shape: exact key allowlist incl. exactAddress + rejectionReason', async () => {
      const { token } = await loginAsSeller();
      const response = await request(app.getHttpServer())
        .post('/lots')
        .set('Authorization', `Bearer ${token}`)
        .send(validLotBody(parent.id))
        .expect(201);

      // Allowlist: the owner payload carries BOTH private fields…
      expect(response.body).toHaveProperty('exactAddress', 'تهران، خیابان …، پلاک ۱۲');
      expect(response.body).toHaveProperty('rejectionReason', null);
      // …and EXACTLY the mapped keys — nothing extra leaks by default.
      expect(Object.keys(response.body).sort()).toEqual([
        'availableQuantity',
        'categoryId',
        'city',
        'code',
        'condition',
        'createdAt',
        'description',
        'exactAddress',
        'expiresAt',
        'featuredAt',
        'id',
        'liquidationReason',
        'locationHint',
        'media',
        'minOrderQuantity',
        'pricingType',
        'province',
        'publishedAt',
        'quantity',
        'rejectionReason',
        'saveCount',
        'sellerId',
        'soldAt',
        'status',
        'subcategoryId',
        'title',
        'totalPrice',
        'unit',
        'unitPrice',
        'updatedAt',
        'viewCount',
      ]);
    });

    it.each([
      ['title too short', { title: 'کم' }],
      ['title too long', { title: 'ا'.repeat(121) }],
      ['totalPrice 0', { totalPrice: 0 }],
      ['totalPrice over the 2B cap', { totalPrice: 2_000_000_001 }],
      ['quantity 0', { quantity: 0 }],
      ['unknown condition enum', { condition: 'EXCELLENT' }],
      ['unknown liquidationReason enum', { liquidationReason: 'WHY_NOT' }],
      ['minOrder above quantity', { quantity: 5, minOrderQuantity: 6 }],
      ['description over 5000', { description: 'ا'.repeat(5001) }],
    ])('rejects %s with 400 (DTO rules)', async (_label, overrides) => {
      const { token } = await loginAsSeller();
      await request(app.getHttpServer())
        .post('/lots')
        .set('Authorization', `Bearer ${token}`)
        .send(validLotBody(parent.id, overrides))
        .expect(400);
    });

    it('rejects client-computed unitPrice with 400 (derived server-side only)', async () => {
      const { token } = await loginAsSeller();
      await request(app.getHttpServer())
        .post('/lots')
        .set('Authorization', `Bearer ${token}`)
        .send(validLotBody(parent.id, { unitPrice: 2_000_000 }))
        .expect(400);
    });

    it.each([
      ['geo pair mismatch', { province: 'tehran', city: 'kashan' }],
      ['unknown category', { categoryId: 'missing-category' }],
      ['subcategory not a child of category', { subcategoryId: 'missing-sub' }],
    ])('rejects %s with 400 (service rules)', async (_label, overrides) => {
      const { token } = await loginAsSeller();
      await request(app.getHttpServer())
        .post('/lots')
        .set('Authorization', `Bearer ${token}`)
        .send(validLotBody(parent.id, overrides))
        .expect(400);
    });

    it('accepts a valid subcategory that IS a child of the category', async () => {
      const { token } = await loginAsSeller();
      const response = await request(app.getHttpServer())
        .post('/lots')
        .set('Authorization', `Bearer ${token}`)
        .send(validLotBody(parent.id, { subcategoryId: child.id }))
        .expect(201);
      expect(response.body.subcategoryId).toBe(child.id);
    });
  });

  describe('PATCH /lots/:id', () => {
    it('requires authentication (401 without a token)', async () => {
      const { userId } = await loginAsSeller();
      const lot = seedLot(userId);
      await request(app.getHttpServer())
        .patch(`/lots/${lot.id}`)
        .send({ title: 'عنوان تازه' })
        .expect(401);
    });

    it('runs the draft → edit → submit flow end to end', async () => {
      const { token } = await loginAsSeller();
      const created = await request(app.getHttpServer())
        .post('/lots')
        .set('Authorization', `Bearer ${token}`)
        .send(validLotBody(parent.id))
        .expect(201);

      const edited = await request(app.getHttpServer())
        .patch(`/lots/${created.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'عمده پیراهن آستین‌کوتاه — ۵۰ عدد', locationHint: 'بازار شوش' })
        .expect(200);
      expect(edited.body.title).toContain('آستین‌کوتاه');
      expect(edited.body.status).toBe('DRAFT');

      const submitted = await request(app.getHttpServer())
        .patch(`/lots/${created.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ submit: true })
        .expect(200);
      expect(submitted.body.status).toBe('PENDING_REVIEW');
    });

    it('resubmits a REJECTED lot: PENDING_REVIEW + rejectionReason cleared', async () => {
      const { token, userId } = await loginAsSeller();
      const lot = seedLot(userId, {
        status: LotStatus.REJECTED,
        rejectionReason: 'عکس‌ها کیفیت کافی ندارند',
      });

      const response = await request(app.getHttpServer())
        .patch(`/lots/${lot.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ submit: true })
        .expect(200);

      expect(response.body.status).toBe('PENDING_REVIEW');
      expect(response.body.rejectionReason).toBeNull();
    });

    it('allows ONLY price/quantity fields on an ACTIVE lot and re-derives unitPrice', async () => {
      const { token, userId } = await loginAsSeller();
      const lot = seedLot(userId, { status: LotStatus.ACTIVE, publishedAt: new Date() });

      const edited = await request(app.getHttpServer())
        .patch(`/lots/${lot.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ totalPrice: 1_200_000 })
        .expect(200);
      expect(edited.body.status).toBe('ACTIVE');
      expect(edited.body.totalPrice).toBe(1_200_000);
      expect(edited.body.unitPrice).toBe(120_000); // re-derived, no re-moderation
    });

    it('rejects a content edit on an ACTIVE lot with 409 ILLEGAL_STATUS_EDIT', async () => {
      const { token, userId } = await loginAsSeller();
      const lot = seedLot(userId, { status: LotStatus.ACTIVE });

      const response = await request(app.getHttpServer())
        .patch(`/lots/${lot.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'تغییر محتوایی ممنوع' })
        .expect(409);
      expect(response.body.code).toBe('ILLEGAL_STATUS_EDIT');

      const reread = await prisma.lot.findUnique({ where: { id: lot.id } });
      expect(reread?.title).toBe(lot.title);
    });

    it('rejects PATCH on a PENDING_REVIEW lot with 409 (under moderation)', async () => {
      const { token, userId } = await loginAsSeller();
      const lot = seedLot(userId, { status: LotStatus.PENDING_REVIEW });
      await request(app.getHttpServer())
        .patch(`/lots/${lot.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ totalPrice: 500_000 })
        .expect(409);
    });

    it('returns 403 for a non-owner seller and 404 for an unknown id', async () => {
      const { token, userId } = await loginAsSeller();
      const lot = seedLot(userId);

      const other = await loginAsSeller();
      await request(app.getHttpServer())
        .patch(`/lots/${lot.id}`)
        .set('Authorization', `Bearer ${other.token}`)
        .send({ title: 'عنوان دزدان' })
        .expect(403);

      await request(app.getHttpServer())
        .patch('/lots/missing-lot-id')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'هیچ‌جا نمی‌رود' })
        .expect(404);
    });

    it('rejects edits breaking the resulting quantity rules with 400 (nothing written)', async () => {
      const { token, userId } = await loginAsSeller();
      const lot = seedLot(userId); // minOrderQuantity: 5

      await request(app.getHttpServer())
        .patch(`/lots/${lot.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 2 })
        .expect(400);

      const reread = await prisma.lot.findUnique({ where: { id: lot.id } });
      expect(reread?.quantity).toBe(10);
    });

    it('rejects a broken geo pair on PATCH with 400 (service rule)', async () => {
      const { token, userId } = await loginAsSeller();
      const lot = seedLot(userId);
      await request(app.getHttpServer())
        .patch(`/lots/${lot.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ city: 'kashan' }) // resulting province stays tehran → mismatch
        .expect(400);
    });

    it('rejects a subcategory change that orphans the category with 400', async () => {
      const { token, userId } = await loginAsSeller();
      const lot = seedLot(userId, { subcategoryId: child.id });
      await request(app.getHttpServer())
        .patch(`/lots/${lot.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ subcategoryId: otherChild.id }) // child of shoes, lot category is apparel
        .expect(400);
    });
  });

  // ==========================================================================
  // MKT-001 — public listing: GET /lots (anonymous, ACTIVE-only, sort allowlist)
  // ==========================================================================

  describe('GET /lots (public listing, MKT-001)', () => {
    let seller: { token: string; userId: string };
    let other: { token: string; userId: string };

    /** Every public GET gets its own per-IP throttle bucket (like the login hops). */
    const getLots = (query = '') =>
      request(app.getHttpServer()).get(`/lots${query}`).set('X-Forwarded-For', nextIp());

    /** ACTIVE fixture with full card-relevant fields; overrides per test. */
    const seedPublicLot = (overrides: Partial<Parameters<FakePrisma['seedLot']>[0]> = {}) =>
      prisma.seedLot({
        sellerId: seller.userId,
        categoryId: parent.id,
        title: 'لات عمومی',
        quantity: 10,
        availableQuantity: 10,
        minOrderQuantity: 1,
        pricingType: PricingType.FIXED,
        totalPrice: 1_000_000,
        unitPrice: 100_000,
        condition: LotCondition.GRADE_A,
        liquidationReason: LiquidationReason.OVERSTOCK,
        province: 'tehran',
        city: 'tehran',
        status: LotStatus.ACTIVE,
        publishedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * DAY_MS),
        ...overrides,
      });

    beforeAll(async () => {
      seller = await loginAsSeller();
      other = await loginAsSeller();
      // One seller has a business profile — the card's seller summary carries it.
      prisma.seedProfile({
        userId: seller.userId,
        displayName: 'مینا',
        businessName: 'تولیدی پوشاک مینا',
      });
    });

    it('serves anonymous callers (no Authorization header) — @Public on the route', async () => {
      const response = await getLots().expect(200);
      expect(response.body).toHaveProperty('items');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('page', 1);
      expect(response.body).toHaveProperty('limit', 20);
    });

    it('returns ONLY ACTIVE lots with unexpired expiresAt, newest first by default', async () => {
      const now = Date.now();
      seedPublicLot({ title: 'جدید', createdAt: new Date(now) });
      seedPublicLot({ title: 'قدیمی', createdAt: new Date(now - 5_000) });
      seedPublicLot({ title: 'پیش‌نویس', status: LotStatus.DRAFT, publishedAt: null });
      seedPublicLot({ title: 'مکث‌شده', status: LotStatus.PAUSED, publishedAt: null });
      seedPublicLot({
        title: 'منقضی‌شده',
        expiresAt: new Date(now - DAY_MS), // ACTIVE past expiry — safety predicate
      });
      prisma.seedLot({
        sellerId: seller.userId,
        categoryId: parent.id,
        title: 'حذف‌شده',
        quantity: 10,
        availableQuantity: 10,
        minOrderQuantity: 1,
        pricingType: PricingType.FIXED,
        totalPrice: 1_000_000,
        unitPrice: 100_000,
        condition: LotCondition.GRADE_A,
        liquidationReason: LiquidationReason.OVERSTOCK,
        province: 'tehran',
        city: 'tehran',
        status: LotStatus.REMOVED,
        deletedAt: new Date(),
        expiresAt: new Date(now + 30 * DAY_MS),
      });

      const response = await getLots().expect(200);

      // Earlier suites in this file left ACTIVE lots in the shared store, so
      // assert on the seeds' RELATIVE order (both are newer than everything
      // else, but exact ranks depend on wall-clock, not on store content).
      expect(response.body.total).toBeGreaterThanOrEqual(2);
      const titles = response.body.items.map((lot: { title: string }) => lot.title);
      expect(titles).toContain('جدید');
      expect(titles).toContain('قدیمی');
      expect(titles.indexOf('جدید')).toBeLessThan(titles.indexOf('قدیمی'));
      for (const hidden of ['پیش‌نویس', 'مکث‌شده', 'منقضی‌شده', 'حذف‌شده']) {
        expect(titles).not.toContain(hidden);
      }
    });

    it.each<[string, (a: number, b: number) => boolean, string]>([
      ['priceAsc', (a, b) => a <= b, 'unitPrice'],
      ['priceDesc', (a, b) => a >= b, 'unitPrice'],
      ['quantityAsc', (a, b) => a <= b, 'quantity'],
      ['quantityDesc', (a, b) => a >= b, 'quantity'],
    ])('sorts by %s monotonically', async (sort, isOrdered, field) => {
      seedPublicLot({ title: 'الف', unitPrice: 900_000, quantity: 500 });
      seedPublicLot({ title: 'ب', unitPrice: 100_000, quantity: 5 });
      seedPublicLot({ title: 'پ', unitPrice: 400_000, quantity: 50 });

      const response = await getLots(`?sort=${sort}`).expect(200);

      const values = response.body.items.map((lot: Record<string, number>) => lot[field]);
      for (let i = 1; i < values.length; i += 1) {
        expect(isOrdered(values[i - 1] as number, values[i] as number)).toBe(true);
      }
    });

    it('sort=updatedAt puts the recently edited lot first', async () => {
      const fresh = seedPublicLot({ title: 'تازه‌ویرایش' });
      seedPublicLot({ title: 'قدیمی‌ویرایش', createdAt: new Date(Date.now() + DAY_MS) });
      await prisma.lot.update({ where: { id: fresh.id }, data: { description: 'ویرایش تازه' } });

      const response = await getLots('?sort=updatedAt').expect(200);

      expect(response.body.items[0].title).toBe('تازه‌ویرایش');
    });

    it('sort=expiresAt is ending-soon (asc)', async () => {
      seedPublicLot({ title: 'دیر', expiresAt: new Date(Date.now() + 30 * DAY_MS) });
      seedPublicLot({ title: 'زود', expiresAt: new Date(Date.now() + 2 * DAY_MS) });

      const response = await getLots('?sort=expiresAt').expect(200);

      // Ending-soon asc — relative order of the two seeds (other store lots
      // sit at the default +30d expiry, i.e. behind both).
      const titles = response.body.items.map((lot: { title: string }) => lot.title);
      expect(titles).toContain('زود');
      expect(titles).toContain('دیر');
      expect(titles.indexOf('زود')).toBeLessThan(titles.indexOf('دیر'));
    });

    it('rejects an unknown sort token with 400 (allowlist)', async () => {
      const response = await getLots('?sort=popularity').expect(400);
      expect(JSON.stringify(response.body.message)).toContain('sort must be one of');
    });

    it.each<[string, string]>([
      ['sort decorated with a direction', 'sort=priceAsc:desc'],
      ['limit above the 100 cap', 'limit=101'],
      ['limit 0', 'limit=0'],
      ['page 0', 'page=0'],
    ])('rejects %s with 400 (pagination/sort contract)', async (_label, queryString) => {
      await getLots(`?${queryString}`).expect(400);
    });

    it('paginates (?page=&limit=) with a truthful total', async () => {
      for (let i = 0; i < 3; i += 1) {
        seedPublicLot({ title: `لات ${i}`, createdAt: new Date(Date.now() + i * 1_000) });
      }

      const page1 = await getLots('?page=2&limit=2').expect(200);

      expect(page1.body.total).toBeGreaterThanOrEqual(3);
      expect(page1.body.page).toBe(2);
      expect(page1.body.limit).toBe(2);
      expect(page1.body.items).toHaveLength(2);
    });

    it('serves the CARD allowlist: exact key set, no exactAddress/rejectionReason/locationHint, cover thumb, seller summary, verifiedSeller false', async () => {
      const lot = seedPublicLot({
        title: 'کارت کامل',
        locationHint: 'بازار بزرگ تهران',
        exactAddress: 'تهران، خیابان …، پلاک ۱۲',
        rejectionReason: 'نامربوط — لات ACTIVE است',
      });
      const asset = prisma.seedMediaAsset({
        ownerId: seller.userId,
        type: MediaType.IMAGE,
        mime: 'image/jpeg',
        sizeBytes: 100,
        storageKey: '2026/09/cover-original.jpg',
        thumbKey: '2026/09/cover-thumb.webp',
      });
      prisma.seedLotMedia({ lotId: lot.id, mediaAssetId: asset.id, sortOrder: 0, isCover: true });

      const response = await getLots('?limit=100').expect(200);
      const card = response.body.items.find((item: { id: string }) => item.id === lot.id);

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
      expect(card.code).toHaveLength(8);
      expect(card.coverThumbUrl).toBe('http://localhost:3001/media/2026/09/cover-thumb.webp');
      expect(card.seller).toEqual({
        id: seller.userId,
        name: expect.any(String),
        businessName: 'تولیدی پوشاک مینا',
      });
      // TRS-001/002 placeholder — the slot exists, the badge infra does not.
      expect(card.verifiedSeller).toBe(false);
    });

    it('returns coverThumbUrl null for a lot without media and businessName null without a profile', async () => {
      const bare = seedPublicLot({ sellerId: other.userId, title: 'بدون تصویر' });

      const response = await getLots().expect(200);
      const card = response.body.items.find((item: { id: string }) => item.id === bare.id);

      expect(card.coverThumbUrl).toBeNull();
      expect(card.seller.businessName).toBeNull();
    });
  });

  // ==========================================================================
  // MKT-002 — public listing filters: GET /lots?… (each filter alone + combined)
  // ==========================================================================

  describe('GET /lots filters (MKT-002)', () => {
    /** Marker categories so filter assertions never collide with other suites. */
    let markerCategory: { id: string };
    let markerSub: { id: string };
    let markerCategoryOther: { id: string };
    let filterSeller: { token: string; userId: string };

    /** Every public GET gets its own per-IP throttle bucket. */
    const getLots = (query: string) =>
      request(app.getHttpServer()).get(`/lots?${query}`).set('X-Forwarded-For', nextIp());

    /**
     * ACTIVE fixture with marker field values the other suites never use;
     * every "alone" test seeds one matching lot + one control failing exactly
     * the tested arm, then asserts match present / control absent by id —
     * robust against the shared store's other lots.
     */
    const seedMarkerLot = (
      overrides: Partial<Parameters<FakePrisma['seedLot']>[0]> = {},
    ): { id: string } => {
      const lot = prisma.seedLot({
        sellerId: filterSeller.userId,
        categoryId: markerCategory.id,
        subcategoryId: markerSub.id,
        title: 'لات فیلتر',
        quantity: 50,
        availableQuantity: 50,
        minOrderQuantity: 1,
        pricingType: PricingType.FIXED,
        totalPrice: 30_000_000,
        unitPrice: 600_000,
        condition: LotCondition.GRADE_B,
        liquidationReason: LiquidationReason.EXPORT_RETURN,
        province: 'qazvin',
        city: 'qazvin',
        status: LotStatus.ACTIVE,
        publishedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * DAY_MS),
        ...overrides,
      });
      return { id: lot.id };
    };

    beforeAll(async () => {
      filterSeller = await loginAsSeller();
      markerCategory = prisma.seedCategory({
        nameFa: 'فیلتر والد',
        slug: 'mkt2-parent',
        sortOrder: 90,
      });
      markerSub = prisma.seedCategory({
        nameFa: 'فیلتر فرزند',
        slug: 'mkt2-child',
        parentId: markerCategory.id,
        sortOrder: 1,
      });
      markerCategoryOther = prisma.seedCategory({
        nameFa: 'فیلتر دیگر',
        slug: 'mkt2-other',
        sortOrder: 91,
      });
    });

    it('filters by categoryId alone, and subcategoryId narrows within it', async () => {
      const inSub = seedMarkerLot();
      const inCategoryNoSub = seedMarkerLot({ subcategoryId: null });
      const inOtherCategory = seedMarkerLot({ categoryId: markerCategoryOther.id });

      const byCategory = await getLots(`categoryId=${markerCategory.id}`).expect(200);
      const bySub = await getLots(
        `categoryId=${markerCategory.id}&subcategoryId=${markerSub.id}`,
      ).expect(200);

      const categoryIds = byCategory.body.items.map((lot: { id: string }) => lot.id);
      expect(categoryIds).toContain(inSub.id);
      expect(categoryIds).toContain(inCategoryNoSub.id);
      expect(categoryIds).not.toContain(inOtherCategory.id);
      const subIds = bySub.body.items.map((lot: { id: string }) => lot.id);
      expect(subIds).toContain(inSub.id);
      expect(subIds).not.toContain(inCategoryNoSub.id);
      expect(subIds).not.toContain(inOtherCategory.id);
    });

    it('filters by priceMin/priceMax alone (derived unitPrice, inclusive)', async () => {
      const cheap = seedMarkerLot({ unitPrice: 100_000, totalPrice: 5_000_000 });
      const mid = seedMarkerLot({ unitPrice: 600_000 });
      const pricey = seedMarkerLot({ unitPrice: 900_000, totalPrice: 45_000_000 });

      const byMin = await getLots('priceMin=300000').expect(200);
      const byMax = await getLots('priceMax=600000').expect(200);
      const byRange = await getLots('priceMin=100000&priceMax=600000').expect(200);

      const ids = (response: { body: { items: { id: string }[] } }) =>
        response.body.items.map((lot) => lot.id);
      expect(ids(byMin)).toEqual(expect.arrayContaining([mid.id, pricey.id]));
      expect(ids(byMin)).not.toContain(cheap.id);
      expect(ids(byMax)).toEqual(expect.arrayContaining([cheap.id, mid.id]));
      expect(ids(byMax)).not.toContain(pricey.id);
      expect(ids(byRange)).toEqual(expect.arrayContaining([cheap.id, mid.id]));
      expect(ids(byRange)).not.toContain(pricey.id);
    });

    it('filters by qtyMin/qtyMax alone (quantity, inclusive)', async () => {
      const small = seedMarkerLot({ quantity: 5, availableQuantity: 5 });
      const medium = seedMarkerLot({ quantity: 50 });
      const large = seedMarkerLot({ quantity: 500, availableQuantity: 500 });

      const byMin = await getLots('qtyMin=50').expect(200);
      const byMax = await getLots('qtyMax=50').expect(200);

      const minIds = byMin.body.items.map((lot: { id: string }) => lot.id);
      const maxIds = byMax.body.items.map((lot: { id: string }) => lot.id);
      expect(minIds).toEqual(expect.arrayContaining([medium.id, large.id]));
      expect(minIds).not.toContain(small.id);
      expect(maxIds).toEqual(expect.arrayContaining([small.id, medium.id]));
      expect(maxIds).not.toContain(large.id);
    });

    it('filters by city and province slugs alone; an unknown slug matches nothing (ignored-safe)', async () => {
      const qazvin = seedMarkerLot({ city: 'qazvin', province: 'qazvin' });
      const shiraz = seedMarkerLot({ city: 'shiraz', province: 'fars' });

      const byCity = await getLots('city=qazvin').expect(200);
      const byProvince = await getLots('province=fars').expect(200);
      const byNothing = await getLots('city=atlantis').expect(200);

      expect(byCity.body.items.map((lot: { id: string }) => lot.id)).toContain(qazvin.id);
      expect(byCity.body.items.map((lot: { id: string }) => lot.id)).not.toContain(shiraz.id);
      expect(byProvince.body.items.map((lot: { id: string }) => lot.id)).toContain(shiraz.id);
      expect(byProvince.body.items.map((lot: { id: string }) => lot.id)).not.toContain(qazvin.id);
      expect(byNothing.body.items).toHaveLength(0);
    });

    it('filters by condition[] with OR semantics (repeatable param)', async () => {
      const gradeB = seedMarkerLot({ condition: LotCondition.GRADE_B });
      const mixed = seedMarkerLot({ condition: LotCondition.MIXED });
      const damaged = seedMarkerLot({ condition: LotCondition.DAMAGED });

      const byOne = await getLots(`condition=${LotCondition.MIXED}`).expect(200);
      const byMany = await getLots(
        `condition=${LotCondition.GRADE_B}&condition=${LotCondition.MIXED}`,
      ).expect(200);

      expect(byOne.body.items.map((lot: { id: string }) => lot.id)).toEqual([mixed.id]);
      const manyIds = byMany.body.items.map((lot: { id: string }) => lot.id);
      expect(manyIds).toEqual(expect.arrayContaining([gradeB.id, mixed.id]));
      expect(manyIds).not.toContain(damaged.id);
    });

    it('filters by pricingType alone', async () => {
      const fixed = seedMarkerLot({ pricingType: PricingType.FIXED });
      const negotiable = seedMarkerLot({ pricingType: PricingType.NEGOTIABLE });

      const byType = await getLots(`pricingType=${PricingType.NEGOTIABLE}`).expect(200);

      const ids = byType.body.items.map((lot: { id: string }) => lot.id);
      expect(ids).toContain(negotiable.id);
      expect(ids).not.toContain(fixed.id);
    });

    it('filters by liquidationReason[] with OR semantics (repeatable param)', async () => {
      const exportReturn = seedMarkerLot({ liquidationReason: LiquidationReason.EXPORT_RETURN });
      const closure = seedMarkerLot({ liquidationReason: LiquidationReason.FACTORY_CLOSURE });
      const other = seedMarkerLot({ liquidationReason: LiquidationReason.OTHER });

      const byMany = await getLots(
        `liquidationReason=${LiquidationReason.EXPORT_RETURN}&liquidationReason=${LiquidationReason.FACTORY_CLOSURE}`,
      ).expect(200);

      const ids = byMany.body.items.map((lot: { id: string }) => lot.id);
      expect(ids).toEqual(expect.arrayContaining([exportReturn.id, closure.id]));
      expect(ids).not.toContain(other.id);
    });

    it('filters by listedWithin freshness (7d / 30d windows)', async () => {
      const now = Date.now();
      const threeDaysOld = seedMarkerLot({ createdAt: new Date(now - 3 * DAY_MS) });
      const tenDaysOld = seedMarkerLot({ createdAt: new Date(now - 10 * DAY_MS) });
      const fortyDaysOld = seedMarkerLot({ createdAt: new Date(now - 40 * DAY_MS) });

      // limit=100: the shared store's other ACTIVE lots are all newer than the
      // markers — the default 20-row page would truncate them out of page 1.
      const within7 = await getLots('listedWithin=7d&limit=100').expect(200);
      const within30 = await getLots('listedWithin=30d&limit=100').expect(200);

      const ids7 = within7.body.items.map((lot: { id: string }) => lot.id);
      const ids30 = within30.body.items.map((lot: { id: string }) => lot.id);
      expect(ids7).toContain(threeDaysOld.id);
      expect(ids7).not.toContain(tenDaysOld.id);
      expect(ids7).not.toContain(fortyDaysOld.id);
      expect(ids30).toEqual(expect.arrayContaining([threeDaysOld.id, tenDaysOld.id]));
      expect(ids30).not.toContain(fortyDaysOld.id);
    });

    it('composes filters in ONE query (category + city + price + qty + condition + pricing + reason + freshness)', async () => {
      const match = seedMarkerLot({
        city: 'tabriz',
        province: 'east-azarbaijan',
        unitPrice: 300_000,
        totalPrice: 36_000_000,
        quantity: 120,
        availableQuantity: 120,
        condition: LotCondition.GRADE_B,
        pricingType: PricingType.NEGOTIABLE,
        liquidationReason: LiquidationReason.SEASON_CLEARANCE,
        createdAt: new Date(Date.now() - 2 * DAY_MS),
      });
      // Each control fails EXACTLY one arm of the combined query.
      const wrongCity = seedMarkerLot({
        city: 'shiraz',
        province: 'fars',
        unitPrice: 300_000,
        totalPrice: 36_000_000,
        quantity: 120,
        availableQuantity: 120,
        condition: LotCondition.GRADE_B,
        pricingType: PricingType.NEGOTIABLE,
        liquidationReason: LiquidationReason.SEASON_CLEARANCE,
        createdAt: new Date(Date.now() - 2 * DAY_MS),
      });
      const wrongPrice = seedMarkerLot({
        city: 'tabriz',
        province: 'east-azarbaijan',
        unitPrice: 900_000,
        totalPrice: 108_000_000,
        quantity: 120,
        availableQuantity: 120,
        condition: LotCondition.GRADE_B,
        pricingType: PricingType.NEGOTIABLE,
        liquidationReason: LiquidationReason.SEASON_CLEARANCE,
        createdAt: new Date(Date.now() - 2 * DAY_MS),
      });
      const tooOld = seedMarkerLot({
        city: 'tabriz',
        province: 'east-azarbaijan',
        unitPrice: 300_000,
        totalPrice: 36_000_000,
        quantity: 120,
        availableQuantity: 120,
        condition: LotCondition.GRADE_B,
        pricingType: PricingType.NEGOTIABLE,
        liquidationReason: LiquidationReason.SEASON_CLEARANCE,
        createdAt: new Date(Date.now() - 20 * DAY_MS),
      });

      const combined = await getLots(
        `categoryId=${markerCategory.id}&city=tabriz&priceMin=100000&priceMax=500000` +
          '&qtyMin=50&qtyMax=200' +
          `&condition=${LotCondition.GRADE_B}&pricingType=${PricingType.NEGOTIABLE}` +
          `&liquidationReason=${LiquidationReason.SEASON_CLEARANCE}&listedWithin=7d`,
      ).expect(200);

      const ids = combined.body.items.map((lot: { id: string }) => lot.id);
      expect(ids).toContain(match.id);
      expect(ids).not.toContain(wrongCity.id);
      expect(ids).not.toContain(wrongPrice.id);
      expect(ids).not.toContain(tooOld.id);
    });

    it('ignores-safe an inverted price range (200, the range is simply empty)', async () => {
      const lot = seedMarkerLot({ unitPrice: 600_000 });

      const inverted = await getLots('priceMin=900000&priceMax=100000').expect(200);

      expect(inverted.body.items.map((item: { id: string }) => item.id)).not.toContain(lot.id);
    });

    it.each<[string, string]>([
      ['an unknown condition enum member', 'condition=JUNK'],
      ['an unknown pricingType enum member', 'pricingType=AUCTION'],
      ['an unknown liquidationReason enum member', 'liquidationReason=JUNK'],
      ['an unknown listedWithin token', 'listedWithin=14d'],
      ['priceMin above the 2B money cap', 'priceMin=2000000001'],
      ['a negative priceMax', 'priceMax=-1'],
      ['qtyMin above the 1M cap', 'qtyMin=1000001'],
      ['a negative qtyMax', 'qtyMax=-5'],
      ['verifiedSeller (deferred to TRS-001 — param not whitelisted yet)', 'verifiedSeller=true'],
    ])('rejects %s with 400', async (_label, queryString) => {
      const response = await getLots(queryString).expect(400);
      // ApiErrorBody carries the exception class name in `error`.
      expect(response.body.error).toBe('BadRequestException');
    });
  });

  // ==========================================================================
  // MKT-003 — public search: GET /lots?q=… (normalized fa matching, relevance,
  // composition with filters/sort, validation bounds)
  // ==========================================================================

  describe('GET /lots search (MKT-003)', () => {
    let searchSeller: { token: string; userId: string };
    let brandSeller: { token: string; userId: string };
    let searchCategory: { id: string };
    let searchSub: { id: string };

    /** Every public GET gets its own per-IP throttle bucket. */
    const searchLots = (query: string) =>
      request(app.getHttpServer()).get(`/lots?${query}`).set('X-Forwarded-For', nextIp());

    /** ACTIVE fixture; marker values the other suites never use. */
    const seedSearchLot = (
      overrides: Partial<Parameters<FakePrisma['seedLot']>[0]> = {},
    ): { id: string } => {
      const lot = prisma.seedLot({
        sellerId: searchSeller.userId,
        categoryId: searchCategory.id,
        title: 'لات جستجو',
        quantity: 10,
        availableQuantity: 10,
        minOrderQuantity: 1,
        pricingType: PricingType.FIXED,
        totalPrice: 10_000_000,
        unitPrice: 100_000,
        condition: LotCondition.GRADE_A,
        liquidationReason: LiquidationReason.OVERSTOCK,
        province: 'qazvin',
        city: 'qazvin',
        status: LotStatus.ACTIVE,
        publishedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * DAY_MS),
        ...overrides,
      });
      return { id: lot.id };
    };

    beforeAll(async () => {
      searchSeller = await loginAsSeller();
      brandSeller = await loginAsSeller();
      // One seller carries a businessName containing the shared keyword —
      // their lots are findable through the RELATION arm alone.
      prisma.seedProfile({
        userId: brandSeller.userId,
        displayName: 'برند',
        businessName: 'فروشگاه تیشرت پارس',
      });
      searchCategory = prisma.seedCategory({
        nameFa: 'پوشاک جستجو',
        slug: 'mkt3-parent',
        sortOrder: 95,
      });
      searchSub = prisma.seedCategory({
        nameFa: 'تی‌شرت فرزند',
        slug: 'mkt3-child',
        parentId: searchCategory.id,
        sortOrder: 1,
      });
    });

    it('finds «تی‌شرت مردانه» with the ZWNJ-free query «تیشرت» (the card acceptance)', async () => {
      const zwnj = seedSearchLot({ title: 'تی‌شرت مردانه' });
      seedSearchLot({ title: 'مجموعه بی‌ربط' });

      const response = await searchLots(`q=${encodeURIComponent('تیشرت')}`).expect(200);

      const ids = response.body.items.map((lot: { id: string }) => lot.id);
      expect(ids).toContain(zwnj.id);
      // The normalizer is symmetric — the ZWNJ'd query finds it too.
      const zwnjQuery = await searchLots(`q=${encodeURIComponent('تی‌شرت')}`).expect(200);
      expect(zwnjQuery.body.items.map((lot: { id: string }) => lot.id)).toContain(zwnj.id);
    });

    it('finds lots through the seller businessName relation (lot text is clean)', async () => {
      const branded = seedSearchLot({
        sellerId: brandSeller.userId,
        title: 'لات بی‌کلیدواژه',
        description: 'توضیح بدون کلیدواژه',
      });
      const plain = seedSearchLot({ title: 'لات فروشنده دیگر' });

      const response = await searchLots(`q=${encodeURIComponent('تیشرت پارس')}`).expect(200);

      const ids = response.body.items.map((lot: { id: string }) => lot.id);
      expect(ids).toContain(branded.id);
      expect(ids).not.toContain(plain.id);
    });

    it('finds lots through the category / subcategory Persian names', async () => {
      const inCategory = seedSearchLot({ title: 'لات دسته‌ای' });
      const inSub = seedSearchLot({
        subcategoryId: searchSub.id,
        title: 'لات زیر‌دسته‌ای',
      });

      const byParent = await searchLots(`q=${encodeURIComponent('پوشاک جستجو')}`).expect(200);
      expect(byParent.body.items.map((lot: { id: string }) => lot.id)).toContain(inCategory.id);

      const bySub = await searchLots(`q=${encodeURIComponent('تیشرت')}`).expect(200);
      expect(bySub.body.items.map((lot: { id: string }) => lot.id)).toContain(inSub.id);
    });

    it('composes with filters AND an explicit sort (search + city + priceAsc)', async () => {
      const cheap = seedSearchLot({
        title: 'تی‌شرت ساده',
        city: 'qazvin',
        unitPrice: 300_000,
        totalPrice: 15_000_000,
      });
      const pricey = seedSearchLot({
        title: 'تی‌شرت درجه‌یک',
        city: 'qazvin',
        unitPrice: 900_000,
        totalPrice: 45_000_000,
      });
      const otherCity = seedSearchLot({
        title: 'تیشرت شهرستان',
        city: 'shiraz',
        province: 'fars',
      });

      const response = await searchLots(
        `q=${encodeURIComponent('تیشرت')}&city=qazvin&sort=priceAsc`,
      ).expect(200);

      const cards = response.body.items as Array<{ id: string; unitPrice: number }>;
      const ids = cards.map((lot) => lot.id);
      expect(ids).toContain(cheap.id);
      expect(ids).toContain(pricey.id);
      expect(ids).not.toContain(otherCity.id);
      for (let i = 1; i < cards.length; i += 1) {
        expect(cards[i]!.unitPrice).toBeGreaterThanOrEqual(cards[i - 1]!.unitPrice);
      }
    });

    it('puts exact-title-prefix matches first on the DEFAULT sort (relevance), explicit sort overrides', async () => {
      const prefix = seedSearchLot({
        title: 'تیشرت آراسته', // prefix hit — but the OLDEST seed
        createdAt: new Date(Date.now() - 3 * DAY_MS),
      });
      const descriptionOnly = seedSearchLot({
        title: 'مجموعه پوشاک',
        description: 'فروش تیشرت عمده', // contains hit — NEWER
        createdAt: new Date(Date.now() - 1 * DAY_MS),
      });

      const byRelevance = await searchLots(`q=${encodeURIComponent('تیشرت')}`).expect(200);
      const relevanceIds = byRelevance.body.items.map((lot: { id: string }) => lot.id);
      expect(relevanceIds).toContain(prefix.id);
      expect(relevanceIds).toContain(descriptionOnly.id);
      expect(relevanceIds.indexOf(prefix.id)).toBeLessThan(
        relevanceIds.indexOf(descriptionOnly.id),
      );

      const byNewest = await searchLots(`q=${encodeURIComponent('تیشرت')}&sort=createdAt`).expect(
        200,
      );
      const newestIds = byNewest.body.items.map((lot: { id: string }) => lot.id);
      expect(newestIds.indexOf(descriptionOnly.id)).toBeLessThan(newestIds.indexOf(prefix.id));
    });

    it('returns an honest empty page for a query matching nothing', async () => {
      seedSearchLot({ title: 'کفش ورزشی' });

      const response = await searchLots(`q=${encodeURIComponent('زیب‌ناموجودکلن')}`).expect(200);

      expect(response.body.items).toEqual([]);
      expect(response.body.total).toBe(0);
    });

    it('400 SEARCH_QUERY_TOO_SHORT for q below 2 characters (incl. ZWNJ-only)', async () => {
      const short = await searchLots(`q=${encodeURIComponent('ا')}`).expect(400);
      expect(short.body.code).toBe('SEARCH_QUERY_TOO_SHORT');

      // Two ZWNJs pass the length check but normalize to nothing — same code.
      const zwnjOnly = await searchLots(`q=${encodeURIComponent('‌‌')}`).expect(400);
      expect(zwnjOnly.body.code).toBe('SEARCH_QUERY_TOO_SHORT');
    });

    it('400 for q above 100 characters', async () => {
      await searchLots(`q=${encodeURIComponent('ا'.repeat(101))}`).expect(400);
    });
  });

  // ==========================================================================
  // LOT-005 — owner reads: GET /lots/mine (seller inventory) + GET /lots/:id
  // ==========================================================================

  describe('GET /lots/mine', () => {
    it('requires authentication (401 without a token)', async () => {
      await request(app.getHttpServer()).get('/lots/mine').expect(401);
    });

    it('rejects buyer-only accounts with 403 + code SELLER_REQUIRED', async () => {
      const buyer = await login(nextPhone());
      const response = await request(app.getHttpServer())
        .get('/lots/mine')
        .set('Authorization', `Bearer ${buyer}`)
        .expect(403);
      expect(response.body.code).toBe('SELLER_REQUIRED');
    });

    it('returns the caller’s lots across every non-REMOVED status, newest first, in the Paginated envelope', async () => {
      const { token, userId } = await loginAsSeller();
      const now = Date.now();
      seedLot(userId, {
        title: 'قدیمی‌ترین',
        status: LotStatus.DRAFT,
        createdAt: new Date(now - 2_000),
      });
      seedLot(userId, {
        title: 'جدیدترین',
        status: LotStatus.ACTIVE,
        publishedAt: new Date(),
        createdAt: new Date(now),
      });
      seedLot(userId, {
        title: 'میانه',
        status: LotStatus.PAUSED,
        createdAt: new Date(now - 1_000),
      });
      seedLot(userId, { title: 'حذف‌شده', status: LotStatus.REMOVED, deletedAt: new Date() });

      const response = await request(app.getHttpServer())
        .get('/lots/mine')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.total).toBe(3);
      expect(response.body.page).toBe(1);
      expect(response.body.limit).toBe(20);
      expect(response.body.items.map((lot: { title: string }) => lot.title)).toEqual([
        'جدیدترین',
        'میانه',
        'قدیمی‌ترین',
      ]);
      // Owner shape per row: the private fields + the gallery array.
      expect(response.body.items[0]).toHaveProperty('exactAddress');
      expect(response.body.items[0]).toHaveProperty('rejectionReason');
      expect(Array.isArray(response.body.items[0].media)).toBe(true);
    });

    it('isolates by owner — another seller’s lots never appear', async () => {
      const { userId } = await loginAsSeller();
      seedLot(userId, { title: 'مال من' });
      const other = await loginAsSeller();
      seedLot(other.userId, { title: 'مال دیگری' });

      const response = await request(app.getHttpServer())
        .get('/lots/mine')
        .set('Authorization', `Bearer ${other.token}`)
        .expect(200);

      expect(response.body.items.map((lot: { title: string }) => lot.title)).toEqual(['مال دیگری']);
    });

    it('filters by status (?status=DRAFT) and validates the enum (400 on junk)', async () => {
      const { token, userId } = await loginAsSeller();
      seedLot(userId, { title: 'پیش‌نویس', status: LotStatus.DRAFT });
      seedLot(userId, { title: 'فعال', status: LotStatus.ACTIVE, publishedAt: new Date() });

      const drafts = await request(app.getHttpServer())
        .get('/lots/mine?status=DRAFT')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(drafts.body.items.map((lot: { title: string }) => lot.title)).toEqual(['پیش‌نویس']);
      expect(drafts.body.total).toBe(1);

      const sold = await request(app.getHttpServer())
        .get('/lots/mine?status=SOLD')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(sold.body.items).toEqual([]);
      expect(sold.body.total).toBe(0);

      await request(app.getHttpServer())
        .get('/lots/mine?status=NOT_A_STATUS')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('paginates (?page=&limit=)', async () => {
      const { token, userId } = await loginAsSeller();
      for (let i = 0; i < 3; i += 1) {
        seedLot(userId, { title: `لوت ${i}` });
      }

      const page1 = await request(app.getHttpServer())
        .get('/lots/mine?page=1&limit=2')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const page2 = await request(app.getHttpServer())
        .get('/lots/mine?page=2&limit=2')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(page1.body.total).toBe(3);
      expect(page1.body.items).toHaveLength(2);
      expect(page2.body.items).toHaveLength(1);
    });
  });

  describe('GET /lots/:id (owner read)', () => {
    it('requires authentication (401 without a token)', async () => {
      const { userId } = await loginAsSeller();
      const lot = seedLot(userId);
      await request(app.getHttpServer()).get(`/lots/${lot.id}`).expect(401);
    });

    it('returns the owner shape: exactAddress + rejectionReason + media, exact key allowlist', async () => {
      const { token, userId } = await loginAsSeller();
      const lot = seedLot(userId, {
        status: LotStatus.REJECTED,
        rejectionReason: 'عکس‌ها کیفیت کافی ندارند',
        exactAddress: 'تهران، خیابان …، پلاک ۱۲',
      });

      const response = await request(app.getHttpServer())
        .get(`/lots/${lot.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.id).toBe(lot.id);
      expect(response.body.exactAddress).toBe('تهران، خیابان …، پلاک ۱۲');
      expect(response.body.rejectionReason).toBe('عکس‌ها کیفیت کافی ندارند');
      expect(Array.isArray(response.body.media)).toBe(true);
      expect(Object.keys(response.body).sort()).toContain('exactAddress');
    });

    it('resolves a REMOVED lot for its owner (LOT-003 soft-delete semantics)', async () => {
      const { token, userId } = await loginAsSeller();
      const lot = seedLot(userId, { status: LotStatus.REMOVED, deletedAt: new Date() });

      const response = await request(app.getHttpServer())
        .get(`/lots/${lot.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(response.body.status).toBe('REMOVED');
    });

    it('404 for an unknown id and 403 for a foreign lot', async () => {
      const { token, userId } = await loginAsSeller();
      const lot = seedLot(userId);

      await request(app.getHttpServer())
        .get('/lots/missing-lot-id')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      const other = await loginAsSeller();
      const foreign = await request(app.getHttpServer())
        .get(`/lots/${lot.id}`)
        .set('Authorization', `Bearer ${other.token}`)
        .expect(403);
      expect(foreign.body.message).toContain('own');
    });

    it('403 + SELLER_REQUIRED for buyer-only accounts', async () => {
      const { userId } = await loginAsSeller();
      const lot = seedLot(userId);
      const buyer = await login(nextPhone());
      const response = await request(app.getHttpServer())
        .get(`/lots/${lot.id}`)
        .set('Authorization', `Bearer ${buyer}`)
        .expect(403);
      expect(response.body.code).toBe('SELLER_REQUIRED');
    });
  });

  // ==========================================================================
  // LOT-003 — lifecycle actions (owner-only, table-driven via LOT_TRANSITIONS)
  // ==========================================================================

  describe('lot lifecycle actions (POST /lots/:id/*, DELETE /lots/:id)', () => {
    /** Routes the action name to its HTTP call, optionally authenticated. */
    function actionRequest(token: string | null, action: LotAction, lotId: string) {
      const server = app.getHttpServer();
      const req =
        action === 'delete'
          ? request(server).delete(`/lots/${lotId}`)
          : request(server).post(`/lots/${lotId}/${action}`);
      return token ? req.set('Authorization', `Bearer ${token}`) : req;
    }

    it.each(LOT_ACTIONS)('%s: requires authentication (401 without a token)', async (action) => {
      const { userId } = await loginAsSeller();
      const lot = seedLot(userId, { status: LotStatus.ACTIVE, publishedAt: new Date() });
      await actionRequest(null, action, lot.id).expect(401);
    });

    it.each(LOT_ACTIONS)(
      '%s: rejects buyer-only accounts (403 + SELLER_REQUIRED)',
      async (action) => {
        const buyer = await login(nextPhone()); // fresh account, no SELLER hat
        const { userId } = await loginAsSeller();
        const lot = seedLot(userId, { status: LotStatus.ACTIVE, publishedAt: new Date() });

        const response = await actionRequest(buyer, action, lot.id).expect(403);
        expect(response.body.code).toBe('SELLER_REQUIRED');
      },
    );

    it.each(LOT_ACTIONS)('%s: 403 for a non-owner seller (not 404)', async (action) => {
      const { userId } = await loginAsSeller();
      const lot = seedLot(userId, { status: LotStatus.ACTIVE, publishedAt: new Date() });
      const other = await loginAsSeller();

      await actionRequest(other.token, action, lot.id).expect(403);
    });

    it.each(LOT_ACTIONS)('%s: 404 for an unknown lot id', async (action) => {
      const { token } = await loginAsSeller();
      await actionRequest(token, action, 'missing-lot-id').expect(404);
    });

    it('submit: DRAFT → PENDING_REVIEW with a refreshed +30d expiry', async () => {
      const { token, userId } = await loginAsSeller();
      const lot = seedLot(userId, { status: LotStatus.DRAFT, expiresAt: soonExpiry() });
      const before = Date.now();

      const response = await actionRequest(token, 'submit', lot.id).expect(200);

      expect(response.body.status).toBe('PENDING_REVIEW');
      const span = new Date(response.body.expiresAt).getTime() - before;
      expect(span).toBeGreaterThanOrEqual(30 * DAY_MS - 1_000);
      expect(span).toBeLessThanOrEqual(30 * DAY_MS + 5_000);
    });

    it('submit: REJECTED → PENDING_REVIEW and the verdict is cleared', async () => {
      const { token, userId } = await loginAsSeller();
      const lot = seedLot(userId, {
        status: LotStatus.REJECTED,
        rejectionReason: 'عکس‌ها کیفیت کافی ندارند',
      });

      const response = await actionRequest(token, 'submit', lot.id).expect(200);

      expect(response.body.status).toBe('PENDING_REVIEW');
      expect(response.body.rejectionReason).toBeNull();
    });

    it('pause → resume round trip: ACTIVE → PAUSED → ACTIVE', async () => {
      const { token, userId } = await loginAsSeller();
      const lot = seedLot(userId, { status: LotStatus.ACTIVE, publishedAt: new Date() });

      const paused = await actionRequest(token, 'pause', lot.id).expect(200);
      expect(paused.body.status).toBe('PAUSED');

      const resumed = await actionRequest(token, 'resume', lot.id).expect(200);
      expect(resumed.body.status).toBe('ACTIVE');
      expect(resumed.body.publishedAt).not.toBeNull(); // resume ≠ re-publication
    });

    it('resume: 409 EXPIRED when the paused lot passed its expiresAt (row untouched)', async () => {
      const { token, userId } = await loginAsSeller();
      const lot = seedLot(userId, {
        status: LotStatus.PAUSED,
        expiresAt: new Date(Date.now() - DAY_MS),
      });

      const response = await actionRequest(token, 'resume', lot.id).expect(409);
      expect(response.body.code).toBe('EXPIRED');

      const reread = await prisma.lot.findUnique({ where: { id: lot.id } });
      expect(reread?.status).toBe('PAUSED');
    });

    it('mark-sold: SOLD with soldAt=now and availableQuantity 0 (owner shape)', async () => {
      const { token, userId } = await loginAsSeller();
      const lot = seedLot(userId, {
        status: LotStatus.ACTIVE,
        publishedAt: new Date(),
        availableQuantity: 6,
        exactAddress: 'تهران، خیابان …، پلاک ۱۲',
      });
      const before = Date.now();

      const response = await actionRequest(token, 'mark-sold', lot.id).expect(200);

      expect(response.body.status).toBe('SOLD');
      expect(response.body.availableQuantity).toBe(0);
      expect(new Date(response.body.soldAt).getTime()).toBeGreaterThanOrEqual(before - 1_000);
      // Owner shape on action responses too:
      expect(response.body).toHaveProperty('exactAddress', 'تهران، خیابان …، پلاک ۱۲');
    });

    it('duplicate: 201 with a NEW DRAFT — fresh code/expiry, zeroed counters, content copied', async () => {
      const { token, userId } = await loginAsSeller();
      const lot = seedLot(userId, {
        status: LotStatus.ACTIVE,
        publishedAt: new Date(),
        viewCount: 41,
        saveCount: 7,
        exactAddress: 'تهران، خیابان …، پلاک ۱۲',
      });
      const before = Date.now();

      const response = await actionRequest(token, 'duplicate', lot.id).expect(201);

      const copy = response.body;
      expect(copy.id).not.toBe(lot.id);
      expect(copy.status).toBe('DRAFT');
      expect(copy.code).toHaveLength(8);
      expect(copy.code).not.toBe(lot.code);
      // Content copied verbatim (incl. the private owner field):
      expect(copy.title).toBe(lot.title);
      expect(copy.categoryId).toBe(parent.id);
      expect(copy.subcategoryId).toBe(child.id);
      expect(copy.totalPrice).toBe(1_000_000);
      expect(copy.unitPrice).toBe(100_000);
      expect(copy.exactAddress).toBe('تهران، خیابان …، پلاک ۱۲');
      // Lifecycle state reset:
      expect(copy.viewCount).toBe(0);
      expect(copy.saveCount).toBe(0);
      expect(copy.soldAt).toBeNull();
      expect(copy.publishedAt).toBeNull();
      expect(copy.rejectionReason).toBeNull();
      const span = new Date(copy.expiresAt).getTime() - before;
      expect(span).toBeGreaterThanOrEqual(30 * DAY_MS - 1_000);
      expect(span).toBeLessThanOrEqual(30 * DAY_MS + 5_000);
      // Source untouched:
      const source = await prisma.lot.findUnique({ where: { id: lot.id } });
      expect(source?.status).toBe('ACTIVE');
      expect(source?.viewCount).toBe(41);
    });

    it('duplicate: works on a SOLD lot (the re-list path) and on EXPIRED, but not REMOVED', async () => {
      const { token, userId } = await loginAsSeller();
      const sold = seedLot(userId, { status: LotStatus.SOLD, soldAt: new Date() });
      await actionRequest(token, 'duplicate', sold.id).expect(201);

      const expired = seedLot(userId, {
        status: LotStatus.EXPIRED,
        expiresAt: new Date(Date.now() - DAY_MS),
      });
      await actionRequest(token, 'duplicate', expired.id).expect(201);

      const removed = seedLot(userId, { status: LotStatus.REMOVED, deletedAt: new Date() });
      const conflict = await actionRequest(token, 'duplicate', removed.id).expect(409);
      expect(conflict.body.code).toBe('ILLEGAL_TRANSITION');
    });

    it('delete: 200 with the REMOVED owner body; row soft-deleted, not gone', async () => {
      const { token, userId } = await loginAsSeller();
      const lot = seedLot(userId, { status: LotStatus.ACTIVE, publishedAt: new Date() });

      const response = await actionRequest(token, 'delete', lot.id).expect(200);

      expect(response.body.status).toBe('REMOVED');

      const reread = await prisma.lot.findUnique({ where: { id: lot.id } });
      expect(reread?.status).toBe('REMOVED');
      expect(reread?.deletedAt).not.toBeNull();
    });

    it.each<[string, LotAction, LotStatus]>([
      ['submit an ACTIVE lot', 'submit', LotStatus.ACTIVE],
      ['submit a PENDING_REVIEW lot', 'submit', LotStatus.PENDING_REVIEW],
      ['pause a DRAFT', 'pause', LotStatus.DRAFT],
      ['pause a PAUSED lot (again)', 'pause', LotStatus.PAUSED],
      ['resume an ACTIVE lot', 'resume', LotStatus.ACTIVE],
      ['mark-sold a DRAFT', 'mark-sold', LotStatus.DRAFT],
      ['mark-sold a SOLD lot (again)', 'mark-sold', LotStatus.SOLD],
      ['delete a SOLD lot', 'delete', LotStatus.SOLD],
      ['delete a REMOVED lot (again)', 'delete', LotStatus.REMOVED],
      ['duplicate a REMOVED lot', 'duplicate', LotStatus.REMOVED],
    ])('rejects %s with 409 ILLEGAL_TRANSITION', async (_label, action, status) => {
      const { token, userId } = await loginAsSeller();
      const lot = seedLot(userId, {
        status,
        publishedAt: status === LotStatus.ACTIVE || status === LotStatus.PAUSED ? new Date() : null,
        soldAt: status === LotStatus.SOLD ? new Date() : null,
        deletedAt: status === LotStatus.REMOVED ? new Date() : null,
      });

      const response = await actionRequest(token, action, lot.id).expect(409);
      expect(response.body.code).toBe('ILLEGAL_TRANSITION');

      const reread = await prisma.lot.findUnique({ where: { id: lot.id } });
      expect(reread?.status).toBe(status);
    });
  });

  // ==========================================================================
  // MEDIA-005 — PUT /lots/:id/media (ordered gallery replace with cover)
  // ==========================================================================

  describe('PUT /lots/:id/media', () => {
    /** 600×400 real PNG generated in-process — no binary fixtures committed. */
    const png = sharp({
      create: { width: 600, height: 400, channels: 3, background: { r: 30, g: 144, b: 255 } },
    })
      .png()
      .toBuffer();

    const uploadImage = async (token: string): Promise<string> => {
      const response = await request(app.getHttpServer())
        .post('/media')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Forwarded-For', nextIp())
        .attach('file', await png, { filename: 'photo.png', contentType: 'image/png' })
        .expect(201);
      return response.body.id as string;
    };

    const putMedia = (token: string | null, lotId: string, body: Record<string, unknown>) => {
      const req = request(app.getHttpServer()).put(`/lots/${lotId}/media`).send(body);
      return (token ? req.set('Authorization', `Bearer ${token}`) : req).set(
        'X-Forwarded-For',
        nextIp(),
      );
    };

    it('401 for anonymous callers', async () => {
      const { userId } = await loginAsSeller();
      const lot = seedLot(userId);
      await putMedia(null, lot.id, { items: [] }).expect(401);
    });

    it('403 SELLER_REQUIRED for buyer-only accounts', async () => {
      const buyer = await login(nextPhone());
      const { userId } = await loginAsSeller();
      const lot = seedLot(userId);
      const response = await putMedia(buyer, lot.id, { items: [] }).expect(403);
      expect(response.body.code).toBe('SELLER_REQUIRED');
    });

    it('sets an ordered gallery on a DRAFT lot with 2 uploaded images: media[] ordered, cover by coverIndex, absolute urls + thumbs', async () => {
      const { token, userId } = await loginAsSeller();
      const lot = seedLot(userId, { exactAddress: 'تهران، خیابان …، پلاک ۱۲' });
      const first = await uploadImage(token);
      const second = await uploadImage(token);

      const response = await putMedia(token, lot.id, {
        items: [{ mediaAssetId: second }, { mediaAssetId: first }],
        coverIndex: 1,
      }).expect(200);

      // Owner shape: the private field AND the gallery, ordered by sortOrder.
      expect(response.body.exactAddress).toBe('تهران، خیابان …، پلاک ۱۲');
      expect(response.body.media).toHaveLength(2);
      const [firstItem, secondItem] = response.body.media;
      expect(firstItem).toMatchObject({
        mediaAssetId: second,
        kind: 'IMAGE',
        sortOrder: 0,
        isCover: false,
      });
      expect(firstItem.url).toMatch(
        /^http:\/\/localhost:3001\/media\/\d{4}\/\d{2}\/[a-z0-9]+\.png$/,
      );
      expect(firstItem.thumbUrl).toMatch(
        /^http:\/\/localhost:3001\/media\/\d{4}\/\d{2}\/[a-z0-9]+t\.webp$/,
      );
      expect(secondItem).toMatchObject({
        mediaAssetId: first,
        kind: 'IMAGE',
        sortOrder: 1,
        isCover: true,
      });
    });

    it('replaces the gallery: the removed image disappears, the kept one flips cover', async () => {
      const { token, userId } = await loginAsSeller();
      const lot = seedLot(userId);
      const first = await uploadImage(token);
      const second = await uploadImage(token);

      await putMedia(token, lot.id, {
        items: [{ mediaAssetId: first }, { mediaAssetId: second }],
      }).expect(200);

      const replaced = await putMedia(token, lot.id, {
        items: [{ mediaAssetId: second }],
        coverIndex: 0,
      }).expect(200);
      expect(replaced.body.media).toHaveLength(1);
      expect(replaced.body.media[0]).toMatchObject({
        mediaAssetId: second,
        sortOrder: 0,
        isCover: true,
      });

      const links = await prisma.lotMedia.findMany({ where: { lotId: lot.id } });
      expect(links).toHaveLength(1);
      expect(links[0]?.mediaAssetId).toBe(second);
    });

    it('409 MEDIA_CAP_EXCEEDED (with counts) on a 16th image — assets seeded directly; the upload pipeline is covered by the MEDIA suites', async () => {
      const { token, userId } = await loginAsSeller();
      const lot = seedLot(userId);
      const assetIds = Array.from(
        { length: 16 },
        () =>
          prisma.seedMediaAsset({
            ownerId: userId,
            type: MediaType.IMAGE,
            mime: 'image/png',
            sizeBytes: 100,
          }).id,
      );
      const response = await putMedia(token, lot.id, {
        items: assetIds.map((mediaAssetId) => ({ mediaAssetId })),
      }).expect(409);
      expect(response.body.code).toBe('MEDIA_CAP_EXCEEDED');
      expect(response.body.message).toContain('16');
      expect(response.body.message).toContain('15');
    });

    it('409 MEDIA_CAP_EXCEEDED on a 4th video', async () => {
      const { token, userId } = await loginAsSeller();
      const lot = seedLot(userId);
      const assetIds = Array.from(
        { length: 4 },
        () =>
          prisma.seedMediaAsset({
            ownerId: userId,
            type: MediaType.VIDEO,
            mime: 'video/mp4',
            sizeBytes: 100,
          }).id,
      );
      const response = await putMedia(token, lot.id, {
        items: assetIds.map((mediaAssetId) => ({ mediaAssetId })),
      }).expect(409);
      expect(response.body.code).toBe('MEDIA_CAP_EXCEEDED');
    });

    it('403 MEDIA_NOT_OWNED for an asset uploaded by another seller', async () => {
      const { token, userId } = await loginAsSeller();
      const other = await loginAsSeller();
      const lot = seedLot(userId);
      const foreignId = await uploadImage(other.token);
      const response = await putMedia(token, lot.id, {
        items: [{ mediaAssetId: foreignId }],
      }).expect(403);
      expect(response.body.code).toBe('MEDIA_NOT_OWNED');
    });

    it('409 ILLEGAL_STATUS_EDIT for a listed lot — media is a content change', async () => {
      const { token, userId } = await loginAsSeller();
      const lot = seedLot(userId, { status: LotStatus.ACTIVE, publishedAt: new Date() });
      const assetId = await uploadImage(token);
      const response = await putMedia(token, lot.id, {
        items: [{ mediaAssetId: assetId }],
      }).expect(409);
      expect(response.body.code).toBe('ILLEGAL_STATUS_EDIT');

      const reread = await prisma.lotMedia.findMany({ where: { lotId: lot.id } });
      expect(reread).toHaveLength(0);
    });

    it('404 for an unknown lot; 403 for a foreign lot', async () => {
      const { token } = await loginAsSeller();
      await putMedia(token, 'missing-lot', { items: [] }).expect(404);

      const { userId } = await loginAsSeller();
      const lot = seedLot(userId);
      await putMedia(token, lot.id, { items: [] }).expect(403);
    });
  });
});
