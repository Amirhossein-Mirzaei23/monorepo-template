import type { INestApplication } from '@nestjs/common';
import { LiquidationReason, LotCondition, LotStatus, PricingType } from '@prisma/client';
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
 */
describe('LotsController (e2e)', () => {
  let app: INestApplication;
  let prisma: FakePrisma;
  /** Hands out unique client IPs so per-IP @Throttle buckets stay isolated per test. */
  let ipCounter = 0;
  const nextIp = (): string => `10.2.${Math.floor(++ipCounter / 250)}.${(ipCounter % 250) + 1}`;
  /** Fresh phone per login: the OTP send cap (3/hour/phone) must never trip. */
  let phoneCounter = 0;
  const nextPhone = (): string => `0931${String(++phoneCounter).padStart(7, '0')}`;

  let parent: { id: string };
  let child: { id: string };
  let otherChild: { id: string };

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
});
