import type { INestApplication } from '@nestjs/common';
import {
  AccountRole,
  LiquidationReason,
  LotCondition,
  LotStatus,
  MediaType,
  PricingType,
  type User,
} from '@prisma/client';
import request from 'supertest';
import type { FakePrisma } from '../../../test/fakes/fake-prisma';
import { createTestApp } from '../../../test/utils/create-test-app';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Conversations controller e2e (CHT-001): POST /conversations behind the
 * global JWT guard, exercised through the real auth chain (dev-mode OTP login,
 * like the lots/profiles suites). Covers the full precondition matrix (401
 * anonymous, 403 BUYER_REQUIRED incl. its precedence over lot probing, 404
 * unknown lot, 403 SELF_CONVERSATION, 409 INACTIVE_LOT), the get-or-create
 * contract (create-twice → same id, 200 both times; the SYSTEM welcome message
 * present via a direct store check — the messages READ endpoint is CHT-003's),
 * the lot-summary join (cover thumb absolute, unit price, status) and the
 * strict payload allowlist (exact key sets; unread counters/preview never leak).
 */
describe('ConversationsController (e2e)', () => {
  let app: INestApplication;
  let prisma: FakePrisma;
  /** Fresh phone per login: the OTP send cap (3/hour/phone) must never trip. */
  let phoneCounter = 0;
  const nextPhone = (): string => `0941${String(++phoneCounter).padStart(7, '0')}`;
  /** Unique client IPs keep the per-IP global throttle buckets isolated. */
  let ipCounter = 0;
  const nextIp = (): string => `10.4.${Math.floor(++ipCounter / 250)}.${(ipCounter % 250) + 1}`;

  /** Registers-or-logs-in by phone OTP (dev mode echoes the code) → bearer token. */
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

  /** Login + grant hats directly in the store (ONB-001 does it via onboarding). */
  async function loginWithRoles(roles: AccountRole[]): Promise<{ token: string; user: User }> {
    const phone = nextPhone();
    const token = await login(phone);
    const found = await prisma.user.findUnique({ where: { phone } });
    if (!found) {
      throw new Error('loginWithRoles: user row missing after OTP verify');
    }
    await prisma.user.update({ where: { id: found.id }, data: { accountRoles: roles } });
    return { token, user: { ...found, accountRoles: roles } };
  }

  const loginAsBuyer = (): Promise<{ token: string; user: User }> =>
    loginWithRoles([AccountRole.BUYER]);
  const loginAsSeller = (): Promise<{ token: string; user: User }> =>
    loginWithRoles([AccountRole.SELLER]);

  const postConversation = (token: string | undefined, lotId: string) =>
    request(app.getHttpServer())
      .post('/conversations')
      .set('Authorization', token === undefined ? '' : `Bearer ${token}`)
      .set('X-Forwarded-For', nextIp())
      .send({ lotId });

  const seedLot = (
    sellerId: string,
    overrides: Partial<Parameters<FakePrisma['seedLot']>[0]> = {},
  ) =>
    prisma.seedLot({
      sellerId,
      categoryId: 'cat-1',
      title: 'عمده پیراهن مردانه — ۵۰ عدد',
      quantity: 50,
      availableQuantity: 50,
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
      ...overrides,
    });

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.prisma;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /conversations', () => {
    it('requires authentication (401 without a token)', async () => {
      await postConversation(undefined, 'some-lot').expect(401);
    });

    it('rejects an account without the BUYER hat with 403 + code BUYER_REQUIRED — before lot probing', async () => {
      const token = await login(nextPhone());
      // A MISSING lot id must still answer the hat error first (hats before probing).
      const response = await postConversation(token, 'no-such-lot').expect(403);
      expect(response.body.code).toBe('BUYER_REQUIRED');
    });

    it('rejects a malformed body with 400 (lotId must be a string)', async () => {
      const { token } = await loginAsBuyer();
      await request(app.getHttpServer())
        .post('/conversations')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Forwarded-For', nextIp())
        .send({ lotId: 123 })
        .expect(400);
    });

    it('rejects an unknown lot with 404', async () => {
      const { token } = await loginAsBuyer();
      await postConversation(token, 'missing-lot').expect(404);
    });

    it('rejects the seller of the lot (dual-hat) with 403 + code SELF_CONVERSATION', async () => {
      const { token, user } = await loginWithRoles([AccountRole.SELLER, AccountRole.BUYER]);
      const lot = seedLot(user.id);
      const response = await postConversation(token, lot.id).expect(403);
      expect(response.body.code).toBe('SELF_CONVERSATION');
    });

    it('rejects a non-ACTIVE lot with 409 + code INACTIVE_LOT', async () => {
      const seller = await loginAsSeller();
      const lot = seedLot(seller.user.id, { status: LotStatus.DRAFT });
      const buyer = await loginAsBuyer();
      const response = await postConversation(buyer.token, lot.id).expect(409);
      expect(response.body.code).toBe('INACTIVE_LOT');
    });

    it("creates the buyer's thread (200) with the lot summary — cover thumb absolute, price, status", async () => {
      const seller = await loginAsSeller();
      const lot = seedLot(seller.user.id);
      const asset = prisma.seedMediaAsset({
        ownerId: seller.user.id,
        type: MediaType.IMAGE,
        mime: 'image/jpeg',
        sizeBytes: 1024,
        storageKey: '2026/09/cover-original.jpg',
        thumbKey: '2026/09/cover-thumb.webp',
      });
      prisma.seedLotMedia({ lotId: lot.id, mediaAssetId: asset.id, sortOrder: 0, isCover: true });
      const buyer = await loginAsBuyer();

      const response = await postConversation(buyer.token, lot.id).expect(200);

      expect(response.body.lotId).toBe(lot.id);
      expect(response.body.buyerId).toBe(buyer.user.id);
      expect(response.body.sellerId).toBe(seller.user.id); // derived, never sent
      expect(response.body.status).toBe('ACTIVE');
      expect(response.body.lot).toEqual({
        code: lot.code,
        title: lot.title,
        coverThumbUrl: 'http://localhost:3001/media/2026/09/cover-thumb.webp',
        unitPrice: 2_250_000,
        status: 'ACTIVE',
      });
    });

    it('answers 200 with the SAME conversation on create-twice (idempotent get-or-create)', async () => {
      const seller = await loginAsSeller();
      const lot = seedLot(seller.user.id);
      const buyer = await loginAsBuyer();

      const first = await postConversation(buyer.token, lot.id).expect(200);
      const second = await postConversation(buyer.token, lot.id).expect(200);

      expect(second.body.id).toBe(first.body.id);
      // Exactly one thread and one welcome message for the pair.
      const conversations = await prisma.conversation.findUnique({
        where: { lotId_buyerId: { lotId: lot.id, buyerId: buyer.user.id } },
      });
      expect(conversations?.id).toBe(first.body.id);
      const messages = await prisma.message.findMany({
        where: { conversationId: first.body.id },
      });
      expect(messages).toHaveLength(1);
    });

    it('stores the SYSTEM welcome message (sender null, fa body, preview + lastMessageAt set)', async () => {
      const seller = await loginAsSeller();
      const lot = seedLot(seller.user.id, { title: 'مجموعه کوتاه' });
      const buyer = await loginAsBuyer();

      const created = await postConversation(buyer.token, lot.id).expect(200);

      const messages = await prisma.message.findMany({
        where: { conversationId: created.body.id },
      });
      expect(messages).toHaveLength(1);
      const welcome = messages[0];
      expect(welcome?.type).toBe('SYSTEM');
      expect(welcome?.senderId).toBeNull();
      expect(welcome?.body).toMatch(/^گفتگو درباره: مجموعه کوتاه — /);
      expect(welcome?.body?.endsWith(' تومان')).toBe(true);

      const conversation = await prisma.conversation.findUnique({
        where: { id: created.body.id },
      });
      expect(conversation?.lastMessagePreview).toBe(welcome?.body);
      expect(conversation?.lastMessageAt).toBeDefined();
      expect(conversation?.buyerUnreadCount).toBe(0);
      expect(conversation?.sellerUnreadCount).toBe(0);
    });

    it('keeps one thread per buyer per lot: two buyers on one lot → two conversations', async () => {
      const seller = await loginAsSeller();
      const lot = seedLot(seller.user.id);
      const buyerA = await loginAsBuyer();
      const buyerB = await loginAsBuyer();

      const a = await postConversation(buyerA.token, lot.id).expect(200);
      const b = await postConversation(buyerB.token, lot.id).expect(200);

      expect(a.body.id).not.toBe(b.body.id);
      expect(b.body.buyerId).toBe(buyerB.user.id);
    });

    it('exposes EXACTLY the contracted payload keys (no unread counters, no preview, no gallery)', async () => {
      const seller = await loginAsSeller();
      const lot = seedLot(seller.user.id);
      const buyer = await loginAsBuyer();

      const response = await postConversation(buyer.token, lot.id).expect(200);

      expect(Object.keys(response.body).sort()).toEqual(
        [
          'createdAt',
          'id',
          'lastMessageAt',
          'lot',
          'lotId',
          'sellerId',
          'buyerId',
          'status',
        ].sort(),
      );
      expect(Object.keys(response.body.lot).sort()).toEqual(
        ['code', 'coverThumbUrl', 'status', 'title', 'unitPrice'].sort(),
      );
    });
  });
});
