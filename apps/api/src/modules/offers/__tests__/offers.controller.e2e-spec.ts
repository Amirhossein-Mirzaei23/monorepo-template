import type { INestApplication } from '@nestjs/common';
import {
  AccountRole,
  LiquidationReason,
  LotCondition,
  LotStatus,
  MessageType,
  PricingType,
  type User,
} from '@prisma/client';
import request from 'supertest';
import type { FakePrisma } from '../../../test/fakes/fake-prisma';
import { createTestApp } from '../../../test/utils/create-test-app';
import { offerActionMessageBody } from '../offers.constants';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Offers controller e2e (OFR-002): the full negotiation journey through the
 * real HTTP + auth chain (dev-mode OTP login, like the conversations/lots
 * suites). Covers the card's acceptance walk — create → counter → accept
 * WITH sibling auto-reject — plus the stale-qty revalidation, the lazy
 * expiry flip, the role matrix per action, the validation 400s, the
 * role-aware listings (GET /offers?role=… and GET /lots/:lotId/offers) and
 * the strict payload allowlist (exact key sets; buyerId/sellerId/lotId/
 * conversationId/parentId never leak).
 */
describe('OffersController (e2e)', () => {
  let app: INestApplication;
  let prisma: FakePrisma;
  /** Fresh phone per login: the OTP send cap (3/hour/phone) must never trip. */
  let phoneCounter = 0;
  const nextPhone = (): string => `0942${String(++phoneCounter).padStart(7, '0')}`;
  /** Unique client IPs keep the per-IP global throttle buckets isolated. */
  let ipCounter = 0;
  const nextIp = (): string => `10.5.${Math.floor(++ipCounter / 250)}.${(ipCounter % 250) + 1}`;

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

  const auth = (token: string | undefined) => (method: 'post' | 'get', url: string) =>
    request(app.getHttpServer())
      [method](url)
      .set('Authorization', token === undefined ? '' : `Bearer ${token}`)
      .set('X-Forwarded-For', nextIp());

  const postOffer = (token: string | undefined, body: object) =>
    request(app.getHttpServer())
      .post('/offers')
      .set('Authorization', token === undefined ? '' : `Bearer ${token}`)
      .set('X-Forwarded-For', nextIp())
      .send(body);

  const postAction = (token: string | undefined, offerId: string, action: string, body?: object) =>
    request(app.getHttpServer())
      .post(`/offers/${offerId}/${action}`)
      .set('Authorization', token === undefined ? '' : `Bearer ${token}`)
      .set('X-Forwarded-For', nextIp())
      .send(body ?? {});

  const seedLot = (
    sellerId: string,
    overrides: Partial<Parameters<FakePrisma['seedLot']>[0]> = {},
  ) =>
    prisma.seedLot({
      sellerId,
      categoryId: 'cat-1',
      title: 'عمده پیراهن مردانه — ۵۰ عدد',
      quantity: 50,
      availableQuantity: 40,
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

  /** Buyer + seller + an ACTIVE lot + the buyer's thread about it. */
  async function setupNegotiation() {
    const buyer = await loginAsBuyer();
    const seller = await loginAsSeller();
    const lot = seedLot(seller.user.id);
    const conversation = await auth(buyer.token)('post', '/conversations')
      .send({ lotId: lot.id })
      .expect(200);
    return { buyer, seller, lot, conversationId: conversation.body.id as string };
  }

  const createOfferBody = (lotId: string) => ({
    lotId,
    quantity: 10,
    unitPrice: 300_000,
    note: 'لطفاً تا آخر هفته ارسال شود',
  });

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.prisma;
  });

  afterAll(async () => {
    await app.close();
  });

  it('requires authentication (401 without a token on POST /offers)', async () => {
    const lot = seedLot('some-seller');
    await postOffer(undefined, createOfferBody(lot.id)).expect(401);
  });

  it('walks the full negotiation: create (ACTION message) → counter → accept with sibling auto-reject', async () => {
    const { buyer, seller, lot, conversationId } = await setupNegotiation();

    // 1. Buyer makes TWO live offers on the lot — the first tied to the thread.
    const first = await postOffer(buyer.token, {
      ...createOfferBody(lot.id),
      conversationId,
    }).expect(201);
    expect(first.body.status).toBe('PENDING');
    expect(first.body.myRole).toBe('buyer');
    const second = await postOffer(buyer.token, createOfferBody(lot.id)).expect(201);

    // The tied offer posted its ACTION message into the thread (fa template).
    const history = await auth(buyer.token)(
      'get',
      `/conversations/${conversationId}/messages`,
    ).expect(200);
    const action = history.body.items.find(
      (message: { type: string }) => message.type === MessageType.ACTION,
    );
    expect(action.body).toBe(
      offerActionMessageBody(first.body.totalPrice, first.body.quantity, 'PIECE'),
    );

    // 2. The seller counters the first offer — a NEW PENDING child (+72 h).
    const counter = await postAction(seller.token, first.body.id, 'counter', {
      quantity: 10,
      unitPrice: 330_000,
    }).expect(201);
    expect(counter.body.id).not.toBe(first.body.id);
    expect(counter.body.status).toBe('PENDING');
    expect(counter.body.myRole).toBe('seller');
    expect(new Date(counter.body.expiresAt).getTime()).toBeGreaterThan(Date.now() + DAY_MS);
    const afterCounter = await auth(buyer.token)('get', '/offers?role=buyer').expect(200);
    expect(afterCounter.body.items).toContainEqual(
      expect.objectContaining({ id: first.body.id, status: 'COUNTERED' }),
    );

    // 3. The seller accepts the counter-child — the OTHER live sibling
    //    (second) auto-rejects in the same transaction.
    const accepted = await postAction(seller.token, counter.body.id, 'accept').expect(200);
    expect(accepted.body.status).toBe('ACCEPTED');
    expect(accepted.body.myRole).toBe('seller');
    const buyerView = await auth(buyer.token)('get', '/offers?role=buyer').expect(200);
    const statuses = Object.fromEntries(
      buyerView.body.items.map((row: { id: string; status: string }) => [row.id, row.status]),
    );
    expect(statuses[first.body.id]).toBe('COUNTERED');
    expect(statuses[second.body.id]).toBe('REJECTED'); // sibling invalidation
    expect(statuses[counter.body.id]).toBe('ACCEPTED');

    // 4. The thread carries the whole negotiation as ACTION messages.
    const thread = await auth(buyer.token)(
      'get',
      `/conversations/${conversationId}/messages`,
    ).expect(200);
    const actionBodies = thread.body.items
      .filter((message: { type: string }) => message.type === MessageType.ACTION)
      .map((message: { body: string }) => message.body);
    expect(actionBodies).toEqual([
      offerActionMessageBody(first.body.totalPrice, first.body.quantity, 'PIECE'),
      offerActionMessageBody(counter.body.totalPrice, counter.body.quantity, 'PIECE'),
      'پیشنهاد پذیرفته شد',
    ]);
  });

  it('rejects an accept whose lot availability shrank below the offer (409 STALE_QUANTITY)', async () => {
    const { buyer, seller, lot } = await setupNegotiation();
    const offer = await postOffer(buyer.token, createOfferBody(lot.id)).expect(201);
    prisma.lot.update({ where: { id: lot.id }, data: { availableQuantity: 9 } });

    const response = await postAction(seller.token, offer.body.id, 'accept').expect(409);
    expect(response.body.code).toBe('STALE_QUANTITY');
  });

  it('lazily flips a past-due offer to EXPIRED and answers 409 OFFER_EXPIRED', async () => {
    const { buyer, seller, lot } = await setupNegotiation();
    const stale = prisma.seedOffer({
      lotId: lot.id,
      buyerId: buyer.user.id,
      sellerId: seller.user.id,
      quantity: 10,
      unitPrice: 300_000,
      totalPrice: 3_000_000,
      expiresAt: new Date(Date.now() - 1000), // already past due
    });

    const response = await postAction(seller.token, stale.id, 'accept').expect(409);
    expect(response.body.code).toBe('OFFER_EXPIRED');

    // The flip was persisted (visible as a real EXPIRED row, not just the 409).
    const buyerView = await auth(buyer.token)('get', '/offers?role=buyer&status=EXPIRED').expect(
      200,
    );
    expect(buyerView.body.items).toContainEqual(
      expect.objectContaining({ id: stale.id, status: 'EXPIRED' }),
    );
  });

  it('enforces the role matrix per action (403 with role codes)', async () => {
    const { buyer, seller, lot } = await setupNegotiation();
    const foreignSeller = await loginAsSeller();
    const offer = await postOffer(buyer.token, createOfferBody(lot.id)).expect(201);

    // create: hatless account → BUYER_REQUIRED before lot probing (the body
    // must be shape-valid — the validation pipe runs before the service).
    const hatless = await login(nextPhone());
    const hatlessResponse = await postOffer(hatless, {
      lotId: 'no-such-lot',
      quantity: 10,
      unitPrice: 300_000,
    }).expect(403);
    expect(hatlessResponse.body.code).toBe('BUYER_REQUIRED');

    // create: the lot's own seller (dual hat) → SELF_OFFER.
    const dual = await loginWithRoles([AccountRole.SELLER, AccountRole.BUYER]);
    const ownLot = seedLot(dual.user.id);
    const selfResponse = await postOffer(dual.token, createOfferBody(ownLot.id)).expect(403);
    expect(selfResponse.body.code).toBe('SELF_OFFER');

    // counter/accept/reject: a buyer → SELLER_REQUIRED; another seller → OFFER_NOT_SELLER.
    expect((await postAction(buyer.token, offer.body.id, 'accept').expect(403)).body.code).toBe(
      'SELLER_REQUIRED',
    );
    expect(
      (
        await postAction(foreignSeller.token, offer.body.id, 'counter', {
          quantity: 10,
          unitPrice: 330_000,
        }).expect(403)
      ).body.code,
    ).toBe('OFFER_NOT_SELLER');

    // cancel: the lot's seller is not the buyer → OFFER_NOT_BUYER.
    expect((await postAction(seller.token, offer.body.id, 'cancel').expect(403)).body.code).toBe(
      'OFFER_NOT_BUYER',
    );

    // The happy cancel: the buyer withdraws silently.
    await postAction(buyer.token, offer.body.id, 'cancel')
      .expect(200)
      .expect((res) => expect(res.body.status).toBe('CANCELLED'));
  });

  it('validates the input at the boundary (400s)', async () => {
    const { buyer, seller, lot } = await setupNegotiation();

    await postOffer(buyer.token, { lotId: lot.id, quantity: 10, unitPrice: -5 }).expect(400);
    await postOffer(buyer.token, { lotId: lot.id, quantity: 10.5, unitPrice: 300_000 }).expect(400);
    await postOffer(buyer.token, { quantity: 10, unitPrice: 300_000 }).expect(400); // lotId missing
    await postOffer(buyer.token, {
      lotId: lot.id,
      quantity: 10,
      unitPrice: 300_000,
      conversationId: 'no-such-thread',
    }).expect(403); // unknown thread → uniform CONVERSATION_NOT_YOURS

    // Unknown lot / inactive lot on the write path.
    await postOffer(buyer.token, createOfferBody('no-such-lot')).expect(404);
    const paused = seedLot(seller.user.id, { status: LotStatus.PAUSED });
    const inactiveResponse = await postOffer(buyer.token, createOfferBody(paused.id)).expect(409);
    expect(inactiveResponse.body.code).toBe('LOT_NOT_ACTIVE');

    // GET /offers requires the role; an unknown role/status is a 400.
    await auth(buyer.token)('get', '/offers').expect(400);
    await auth(buyer.token)('get', '/offers?role=both').expect(400);
    await auth(buyer.token)('get', '/offers?role=buyer&status=NOPE').expect(400);
  });

  it('serves the role-aware listings and the per-lot seller history with allowlisted payloads', async () => {
    const { buyer, seller, lot } = await setupNegotiation();
    const offer = await postOffer(buyer.token, createOfferBody(lot.id)).expect(201);

    // GET /offers?role=buyer — the buyer sees their offer with the lot summary.
    const buyerPage = await auth(buyer.token)('get', '/offers?role=buyer&status=PENDING').expect(
      200,
    );
    expect(buyerPage.body.total).toBe(1);
    const item = buyerPage.body.items[0];
    expect(item).toEqual(
      expect.objectContaining({
        id: offer.body.id,
        myRole: 'buyer',
        lot: { code: lot.code, title: lot.title, unitPrice: lot.unitPrice },
      }),
    );
    // The strict allowlist: nothing else leaks (identity/thread/chain links).
    expect(Object.keys(item).sort()).toEqual(
      [
        'createdAt',
        'decidedAt',
        'expiresAt',
        'id',
        'lot',
        'myRole',
        'note',
        'quantity',
        'status',
        'totalPrice',
        'unitPrice',
      ].sort(),
    );
    expect(Object.keys(item.lot).sort()).toEqual(['code', 'title', 'unitPrice']);

    // GET /offers?role=seller — the seller's side of the SAME offer.
    const sellerPage = await auth(seller.token)('get', '/offers?role=seller').expect(200);
    expect(sellerPage.body.total).toBe(1);
    expect(sellerPage.body.items[0].myRole).toBe('seller');

    // GET /lots/:lotId/offers — the owner's per-lot history…
    const lotPage = await auth(seller.token)('get', `/lots/${lot.id}/offers`).expect(200);
    expect(lotPage.body.total).toBe(1);
    expect(lotPage.body.items[0].id).toBe(offer.body.id);
    // …a buyer gets 403 SELLER_REQUIRED…
    expect((await auth(buyer.token)('get', `/lots/${lot.id}/offers`).expect(403)).body.code).toBe(
      'SELLER_REQUIRED',
    );
    // …and a foreign seller gets the uniform 404 (unknown or not theirs).
    await auth(seller.token)('get', '/lots/no-such-lot/offers').expect(404);
  });
});
