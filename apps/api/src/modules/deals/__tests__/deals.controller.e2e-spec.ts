import type { INestApplication } from '@nestjs/common';
import {
  AccountRole,
  DeliveryMethod,
  LiquidationReason,
  LotCondition,
  LotStatus,
  MessageType,
  PaymentMethodRecorded,
  PricingType,
  type User,
} from '@prisma/client';
import request from 'supertest';
import type { FakePrisma } from '../../../test/fakes/fake-prisma';
import { createTestApp } from '../../../test/utils/create-test-app';
import { dealCreatedActionBody } from '../deals.constants';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Deals controller e2e (DEAL-002): both creation paths through the real HTTP
 * + auth chain (dev-mode OTP login, like the offers/conversations suites).
 * Covers the card's acceptance walk — offer path (negotiate → accept →
 * POST /deals) and the FIXED-price conversation quick path — the transactional
 * reservation (availableQuantity visibly decremented), the ACTION message +
 * thread lockstep, the buyer-initiated permission chain, the offer-state 409s
 * and the strict payload allowlist.
 */
describe('DealsController (e2e)', () => {
  let app: INestApplication;
  let prisma: FakePrisma;
  /** Fresh phone per login: the OTP send cap (3/hour/phone) must never trip. */
  let phoneCounter = 0;
  const nextPhone = (): string => `0943${String(++phoneCounter).padStart(7, '0')}`;
  /** Unique client IPs keep the per-IP global throttle buckets isolated. */
  let ipCounter = 0;
  const nextIp = (): string => `10.6.${Math.floor(++ipCounter / 250)}.${(ipCounter % 250) + 1}`;

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

  const postDeal = (token: string | undefined, body: object) =>
    request(app.getHttpServer())
      .post('/deals')
      .set('Authorization', token === undefined ? '' : `Bearer ${token}`)
      .set('X-Forwarded-For', nextIp())
      .send(body);

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

  const availabilityOf = async (lotId: string): Promise<number> => {
    const lot = await prisma.lot.findUnique({ where: { id: lotId } });
    if (!lot) {
      throw new Error('availabilityOf: lot missing');
    }
    return lot.availableQuantity;
  };

  /** Buyer + seller + an ACTIVE lot + the buyer's thread about it. */
  async function setupNegotiation(
    lotOverrides: Partial<Parameters<FakePrisma['seedLot']>[0]> = {},
  ) {
    const buyer = await loginAsBuyer();
    const seller = await loginAsSeller();
    const lot = seedLot(seller.user.id, lotOverrides);
    const conversation = await request(app.getHttpServer())
      .post('/conversations')
      .set('Authorization', `Bearer ${buyer.token}`)
      .set('X-Forwarded-For', nextIp())
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

  const dealTerms = {
    quantity: 10,
    unitPrice: 300_000,
    deliveryMethod: DeliveryMethod.SELLER_SHIPS,
    paymentMethod: PaymentMethodRecorded.CARD_TO_CARD,
    deliveryNote: 'بسته‌بندی کارتنی',
  };

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.prisma;
  });

  afterAll(async () => {
    await app.close();
  });

  it('requires authentication (401 without a token on POST /deals)', async () => {
    await postDeal(undefined, dealTerms).expect(401);
  });

  it('rejects a hatless account with 403 BUYER_REQUIRED (before any probing)', async () => {
    const hatless = await login(nextPhone());
    const response = await postDeal(hatless, {
      offerId: 'no-such-offer',
      ...dealTerms,
    }).expect(403);
    expect(response.body.code).toBe('BUYER_REQUIRED');
  });

  it('walks the offer path: offer → seller accept → POST /deals locks terms, reserves stock, 201 + allowlisted payload', async () => {
    const { buyer, seller, lot } = await setupNegotiation();

    const offer = await request(app.getHttpServer())
      .post('/offers')
      .set('Authorization', `Bearer ${buyer.token}`)
      .set('X-Forwarded-For', nextIp())
      .send(createOfferBody(lot.id))
      .expect(201);
    await request(app.getHttpServer())
      .post(`/offers/${offer.body.id}/accept`)
      .set('Authorization', `Bearer ${seller.token}`)
      .set('X-Forwarded-For', nextIp())
      .expect(200);

    const response = await postDeal(buyer.token, {
      offerId: offer.body.id,
      ...dealTerms,
    }).expect(201);

    expect(response.body.status).toBe('NEGOTIATING');
    expect(response.body.myRole).toBe('buyer');
    expect(response.body.quantity).toBe(10);
    expect(response.body.unitPrice).toBe(300_000);
    expect(response.body.totalPrice).toBe(3_000_000);
    expect(response.body.lot).toEqual({ code: lot.code, title: lot.title });
    expect(response.body.deliveryNote).toBe('بسته‌بندی کارتنی');
    expect(response.body.paymentTermsNote).toBeNull();

    // The strict allowlist: nothing else leaks (identity/provenance/internal
    // columns — the notes ARE locked terms, so they surface like the offers
    // response's note).
    expect(Object.keys(response.body).sort()).toEqual(
      [
        'code',
        'createdAt',
        'deliveryMethod',
        'deliveryNote',
        'id',
        'lot',
        'myRole',
        'paymentMethod',
        'paymentTermsNote',
        'quantity',
        'status',
        'totalPrice',
        'unitPrice',
      ].sort(),
    );
    expect(Object.keys(response.body.lot).sort()).toEqual(['code', 'title']);

    // The reservation is real: the lot's availability visibly dropped.
    expect(await availabilityOf(lot.id)).toBe(30);

    // The deal row carries the provenance link.
    const row = await prisma.deal.findUnique({ where: { code: response.body.code } });
    expect(row).toMatchObject({ offerId: offer.body.id, buyerId: buyer.user.id });
  });

  it('rejects a PENDING offer with 409 OFFER_NOT_ACCEPTED (the card’s bad offer state)', async () => {
    const { buyer, lot } = await setupNegotiation();
    const offer = await request(app.getHttpServer())
      .post('/offers')
      .set('Authorization', `Bearer ${buyer.token}`)
      .set('X-Forwarded-For', nextIp())
      .send(createOfferBody(lot.id))
      .expect(201);

    const response = await postDeal(buyer.token, {
      offerId: offer.body.id,
      ...dealTerms,
    }).expect(409);
    expect(response.body.code).toBe('OFFER_NOT_ACCEPTED');
    // Nothing was reserved on the failed create.
    expect(await availabilityOf(lot.id)).toBe(40);
  });

  it('rejects the offer path on an inactive lot with 409 LOT_NOT_ACTIVE', async () => {
    const { buyer, seller, lot } = await setupNegotiation();
    const offer = await request(app.getHttpServer())
      .post('/offers')
      .set('Authorization', `Bearer ${buyer.token}`)
      .set('X-Forwarded-For', nextIp())
      .send(createOfferBody(lot.id))
      .expect(201);
    await request(app.getHttpServer())
      .post(`/offers/${offer.body.id}/accept`)
      .set('Authorization', `Bearer ${seller.token}`)
      .set('X-Forwarded-For', nextIp())
      .expect(200);
    await prisma.lot.update({ where: { id: lot.id }, data: { status: LotStatus.PAUSED } });

    const response = await postDeal(buyer.token, {
      offerId: offer.body.id,
      ...dealTerms,
    }).expect(409);
    expect(response.body.code).toBe('LOT_NOT_ACTIVE');
  });

  it('walks the quick path: FIXED-lot conversation → deal with the price locked from the lot + ACTION message into the thread', async () => {
    const { buyer, lot, conversationId } = await setupNegotiation({
      pricingType: PricingType.FIXED,
      unitPrice: 250_000,
      totalPrice: 12_500_000,
    });

    const response = await postDeal(buyer.token, {
      conversationId,
      quantity: 5,
      deliveryMethod: DeliveryMethod.PICKUP,
      paymentMethod: PaymentMethodRecorded.CASH,
    }).expect(201);

    // The price is the LOT's — the payload sent none.
    expect(response.body.unitPrice).toBe(250_000);
    expect(response.body.totalPrice).toBe(1_250_000);
    expect(response.body.myRole).toBe('buyer');

    // The reservation is real.
    expect(await availabilityOf(lot.id)).toBe(35);

    // The thread announcement («معامله ایجاد شد #CODE») + the lockstep.
    const history = await request(app.getHttpServer())
      .get(`/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .set('X-Forwarded-For', nextIp())
      .expect(200);
    const action = history.body.items.find(
      (message: { type: string }) => message.type === MessageType.ACTION,
    );
    expect(action.body).toBe(dealCreatedActionBody(response.body.code));
    const thread = await prisma.conversation.findUnique({ where: { id: conversationId } });
    expect(thread?.sellerUnreadCount).toBe(1);
    expect(thread?.lastMessagePreview).toBe(dealCreatedActionBody(response.body.code));
  });

  it('rejects the quick path for a NEGOTIABLE lot (409 LOT_NOT_FIXED_PRICE) and a wrong price echo (400 DEAL_PRICE_LOCKED)', async () => {
    const { buyer, conversationId } = await setupNegotiation(); // NEGOTIABLE
    const negotiable = await postDeal(buyer.token, {
      conversationId,
      quantity: 5,
      deliveryMethod: DeliveryMethod.PICKUP,
      paymentMethod: PaymentMethodRecorded.CASH,
    }).expect(409);
    expect(negotiable.body.code).toBe('LOT_NOT_FIXED_PRICE');

    const fixed = await setupNegotiation({
      pricingType: PricingType.FIXED,
      unitPrice: 250_000,
      totalPrice: 12_500_000,
    });
    const echo = await postDeal(fixed.buyer.token, {
      conversationId: fixed.conversationId,
      quantity: 5,
      unitPrice: 999,
      deliveryMethod: DeliveryMethod.PICKUP,
      paymentMethod: PaymentMethodRecorded.CASH,
    }).expect(400);
    expect(echo.body.code).toBe('DEAL_PRICE_LOCKED');
  });

  it('guards the boundaries: uniform 403 for foreign threads, 409 for over-stock, 400s for provenance shape', async () => {
    const { buyer, lot, conversationId } = await setupNegotiation({
      pricingType: PricingType.FIXED,
      unitPrice: 250_000,
      totalPrice: 12_500_000,
    });
    const foreign = await loginAsBuyer();

    // Another buyer's (and an unknown) thread — the uniform 403.
    const foreignResponse = await postDeal(foreign.token, {
      conversationId,
      quantity: 5,
      deliveryMethod: DeliveryMethod.PICKUP,
      paymentMethod: PaymentMethodRecorded.CASH,
    }).expect(403);
    expect(foreignResponse.body.code).toBe('CONVERSATION_NOT_YOURS');
    await postDeal(buyer.token, {
      conversationId: 'no-such-thread',
      quantity: 5,
      deliveryMethod: DeliveryMethod.PICKUP,
      paymentMethod: PaymentMethodRecorded.CASH,
    }).expect(403);

    // More than the lot can cover → 409 (nothing reserved).
    const overStock = await postDeal(buyer.token, {
      conversationId,
      quantity: 1000,
      deliveryMethod: DeliveryMethod.PICKUP,
      paymentMethod: PaymentMethodRecorded.CASH,
    }).expect(409);
    expect(overStock.body.code).toBe('QUANTITY_OUT_OF_RANGE');
    expect(await availabilityOf(lot.id)).toBe(40);

    // Neither source → 400; both sources → 400; an invalid enum → 400.
    await postDeal(buyer.token, {
      quantity: 5,
      deliveryMethod: DeliveryMethod.PICKUP,
      paymentMethod: PaymentMethodRecorded.CASH,
    }).expect(400);
    const offer = await request(app.getHttpServer())
      .post('/offers')
      .set('Authorization', `Bearer ${buyer.token}`)
      .set('X-Forwarded-For', nextIp())
      .send(createOfferBody(lot.id))
      .expect(201);
    await postDeal(buyer.token, {
      offerId: offer.body.id,
      conversationId,
      quantity: 10,
      unitPrice: 250_000,
      deliveryMethod: DeliveryMethod.PICKUP,
      paymentMethod: PaymentMethodRecorded.CASH,
    }).expect(400);
    await postDeal(buyer.token, {
      conversationId,
      quantity: 5,
      deliveryMethod: 'PIGEON',
      paymentMethod: PaymentMethodRecorded.CASH,
    }).expect(400);
  });

  // ---------------------------------------------------------------
  // DEAL-003: the transition endpoints (matrix + participant gates)
  // ---------------------------------------------------------------

  const transition = (token: string, code: string, body: object) =>
    request(app.getHttpServer())
      .post(`/deals/${code}/transition`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Forwarded-For', nextIp())
      .send(body);

  const paymentConfirm = (token: string, code: string) =>
    request(app.getHttpServer())
      .post(`/deals/${code}/payment-confirm`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Forwarded-For', nextIp())
      .send();

  /** A live deal through the offer path: negotiate → accept → POST /deals. */
  const createDealViaOffer = async () => {
    const { buyer, seller, lot } = await setupNegotiation();
    const offer = await request(app.getHttpServer())
      .post('/offers')
      .set('Authorization', `Bearer ${buyer.token}`)
      .set('X-Forwarded-For', nextIp())
      .send(createOfferBody(lot.id))
      .expect(201);
    await request(app.getHttpServer())
      .post(`/offers/${offer.body.id}/accept`)
      .set('Authorization', `Bearer ${seller.token}`)
      .set('X-Forwarded-For', nextIp())
      .expect(200);
    const deal = await postDeal(buyer.token, { offerId: offer.body.id, ...dealTerms }).expect(201);
    return { buyer, seller, lot, deal: deal.body as { code: string; id: string } };
  };

  it('walks the full happy path NEGOTIATING→…→COMPLETED through the endpoints, timeline total', async () => {
    const { buyer, seller, lot, deal } = await createDealViaOffer();

    await transition(seller.token, deal.code, { to: 'AGREED' }).expect(200);
    await transition(buyer.token, deal.code, { to: 'PAYMENT_PENDING' }).expect(200);

    // The payment announcement does NOT move the status (the seller's row does).
    await paymentConfirm(buyer.token, deal.code).expect(200);
    const marked = await prisma.deal.findUnique({ where: { code: deal.code } });
    expect(marked?.status).toBe('PAYMENT_PENDING');
    expect(marked?.paidConfirmedByBuyerAt).not.toBeNull();

    await transition(seller.token, deal.code, { to: 'PAID' }).expect(200);
    await transition(seller.token, deal.code, { to: 'PREPARING' }).expect(200);
    await transition(seller.token, deal.code, { to: 'SHIPPED' }).expect(200);
    await transition(seller.token, deal.code, { to: 'DELIVERED' }).expect(200);
    const completed = await transition(buyer.token, deal.code, {
      to: 'COMPLETED',
    }).expect(200);

    expect(completed.body.status).toBe('COMPLETED');
    expect(completed.body.myRole).toBe('buyer');
    // The reservation stands at COMPLETED (lot SOLD effects are DEAL-005).
    expect(await availabilityOf(lot.id)).toBe(30);

    // The timeline is total: birth + announcement + 7 moves.
    const events = await prisma.dealEvent.findMany({ where: { dealId: deal.id } });
    expect(events).toHaveLength(9);
    const statuses = events.map((event) => event.toStatus);
    expect(statuses).toEqual([
      'NEGOTIATING',
      'AGREED',
      'PAYMENT_PENDING',
      'PAYMENT_PENDING',
      'PAID',
      'PREPARING',
      'SHIPPED',
      'DELIVERED',
      'COMPLETED',
    ]);
    expect(events[3]?.note).toBe('خریدار پرداخت را اعلام کرد');
  });

  it('enforces the matrix over HTTP: role denials 403, illegal pair 409 with the allowed list', async () => {
    const { buyer, seller, deal } = await createDealViaOffer();

    // The buyer may not confirm payment received (the seller's row): walk to
    // PAYMENT_PENDING where the (from, to) pair exists but excludes the buyer.
    await transition(seller.token, deal.code, { to: 'AGREED' }).expect(200);
    await transition(buyer.token, deal.code, { to: 'PAYMENT_PENDING' }).expect(200);
    const roleDenied = await transition(buyer.token, deal.code, { to: 'PAID' }).expect(403);
    expect(roleDenied.body.code).toBe('TRANSITION_ROLE_FORBIDDEN');

    // Walk to DELIVERED — receipt confirmation is the BUYER's row alone.
    await transition(seller.token, deal.code, { to: 'PAID' }).expect(200);
    await transition(seller.token, deal.code, { to: 'PREPARING' }).expect(200);
    await transition(seller.token, deal.code, { to: 'SHIPPED' }).expect(200);
    await transition(seller.token, deal.code, { to: 'DELIVERED' }).expect(200);
    const sellerDenied = await transition(seller.token, deal.code, {
      to: 'COMPLETED',
    }).expect(403);
    expect(sellerDenied.body.code).toBe('TRANSITION_ROLE_FORBIDDEN');

    // A move the table does not know → 409 carrying the allowed next states.
    const illegal = await transition(seller.token, deal.code, { to: 'PAID' }).expect(409);
    expect(illegal.body.code).toBe('ILLEGAL_TRANSITION');
    expect(illegal.body.allowed).toEqual(['COMPLETED', 'DISPUTED']);
    expect(illegal.body.allowedFa).toEqual(['تکمیل شده', 'در اختلاف']);
  });

  it('gates :code routes: 404 unknown code, 403 non-participant', async () => {
    const { buyer, deal } = await createDealViaOffer();
    const outsider = await loginAsBuyer();

    const missing = await transition(buyer.token, 'no-such-code', {
      to: 'AGREED',
    }).expect(404);
    expect(missing.body.code).toBe('DEAL_NOT_FOUND');

    const foreign = await transition(outsider.token, deal.code, {
      to: 'AGREED',
    }).expect(403);
    expect(foreign.body.code).toBe('DEAL_NOT_PARTICIPANT');
    await paymentConfirm(outsider.token, deal.code).expect(403);
  });

  it('rejects a too-short dispute reason with 400 DISPUTE_REASON_TOO_SHORT', async () => {
    const { buyer, deal } = await createDealViaOffer();

    const short = await transition(buyer.token, deal.code, {
      to: 'DISPUTED',
      note: 'خیلی کوتاه',
    }).expect(400);
    expect(short.body.code).toBe('DISPUTE_REASON_TOO_SHORT');

    const enough = await transition(buyer.token, deal.code, {
      to: 'DISPUTED',
      note: 'کالا با آنچه در عکس‌ها نشان داده شده بود تفاوت اساسی دارد',
    }).expect(200);
    expect(enough.body.status).toBe('DISPUTED');
  });

  it('restores the reserved quantity on an early cancel (the DEAL-002 pair, over HTTP)', async () => {
    const { buyer, lot, deal } = await createDealViaOffer();
    expect(await availabilityOf(lot.id)).toBe(30);

    const cancelled = await request(app.getHttpServer())
      .post(`/deals/${deal.code}/cancel`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .set('X-Forwarded-For', nextIp())
      .send({ reason: 'خریدار منصرف شد' })
      .expect(200);

    expect(cancelled.body.status).toBe('CANCELLED');
    expect(await availabilityOf(lot.id)).toBe(40);
  });

  it('guards payment-confirm: 409 outside PAYMENT_PENDING, 409 on the second mark', async () => {
    const { buyer, deal } = await createDealViaOffer();

    // NEGOTIATING — not the payment stage yet.
    const early = await paymentConfirm(buyer.token, deal.code).expect(409);
    expect(early.body.code).toBe('PAYMENT_NOT_PENDING');

    await transition(buyer.token, deal.code, { to: 'AGREED' }).expect(200);
    await transition(buyer.token, deal.code, { to: 'PAYMENT_PENDING' }).expect(200);
    await paymentConfirm(buyer.token, deal.code).expect(200);
    const twice = await paymentConfirm(buyer.token, deal.code).expect(409);
    expect(twice.body.code).toBe('PAYMENT_ALREADY_CONFIRMED');
    const events = await prisma.dealEvent.findMany({ where: { dealId: deal.id } });
    expect(events.filter((event) => event.note === 'خریدار پرداخت را اعلام کرد')).toHaveLength(1);
  });
});
