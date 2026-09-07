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
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import type { FakePrisma } from '../../../test/fakes/fake-prisma';
import { createTestApp } from '../../../test/utils/create-test-app';
import { StorageService } from '../storage/storage.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * CHT-007 — the secure-serving authorization MATRIX e2e (real app: JWT guard,
 * exception filter; FakePrisma + real local-disk storage over a temp root).
 * A chat media asset becomes access-controlled the moment a Message
 * references it: participants (buyer OR seller of a conversation carrying it)
 * stream it, other authenticated callers get 403 SECURE_MEDIA_FORBIDDEN,
 * anonymous callers 401. Unreferenced assets keep the MEDIA-001 contract
 * (authenticated-only 200 on the secure route; the public route is untouched).
 * The variant resolution ({id}c.webp cover / {id}pt.webp poster thumb) gates
 * on the derived BASE asset — documented in media.constants.ts.
 */
describe('Secure chat media (e2e, CHT-007)', () => {
  let app: INestApplication;
  let prisma: FakePrisma;
  let storage: StorageService;

  let ipCounter = 0;
  const nextIp = (): string => `10.9.${Math.floor(++ipCounter / 250)}.${(ipCounter % 250) + 1}`;
  let phoneCounter = 0;
  const nextPhone = (): string => `0971${String(++phoneCounter).padStart(7, '0')}`;

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

  const seedLot = (sellerId: string) =>
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
    });

  /** A real thread (CHT-001 API): buyer + seller + SYSTEM welcome. */
  async function createThread(): Promise<{
    buyer: { token: string; user: User };
    seller: { token: string; user: User };
    conversationId: string;
  }> {
    const seller = await loginAsSeller();
    const lot = seedLot(seller.user.id);
    const buyer = await loginAsBuyer();
    const created = await request(app.getHttpServer())
      .post('/conversations')
      .set('Authorization', `Bearer ${buyer.token}`)
      .set('X-Forwarded-For', nextIp())
      .send({ lotId: lot.id })
      .expect(200);
    return { buyer, seller, conversationId: created.body.id as string };
  }

  const sendMessage = (token: string, conversationId: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(`/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Forwarded-For', nextIp())
      .send(body);

  const getSecure = (token: string | undefined, path: string) =>
    request(app.getHttpServer())
      .get(`/media/secure/${path}`)
      .set('Authorization', token === undefined ? '' : `Bearer ${token}`)
      .set('X-Forwarded-For', nextIp());

  const IMAGE_BYTES = Buffer.from('chat-image-original-bytes');
  const COVER_BYTES = Buffer.from('chat-image-cover-webp');
  const POSTER_BYTES = Buffer.from('chat-video-poster-thumb');

  let chatImageKey: string;
  let chatVideoKey: string;
  let buyerToken: string;
  let sellerToken: string;
  let outsiderToken: string;

  beforeAll(async () => {
    const storageRoot = await mkdtemp(join(tmpdir(), 'media-secure-chat-'));
    process.env.STORAGE_DIR = storageRoot;
    const testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.prisma;
    storage = app.get(StorageService);

    // The chat thread: buyer uploads + sends an IMAGE and a VIDEO message.
    const { buyer, seller, conversationId } = await createThread();
    buyerToken = buyer.token;
    sellerToken = seller.token;

    chatImageKey = '2026/03/chatimage000001.png';
    const assetImage = prisma.seedMediaAsset({
      ownerId: buyer.user.id,
      type: MediaType.IMAGE,
      storageKey: chatImageKey,
      thumbKey: '2026/03/chatimage000001c.webp',
      mime: 'image/png',
      sizeBytes: IMAGE_BYTES.length,
    });
    await storage.put(chatImageKey, IMAGE_BYTES, 'image/png');
    await storage.put('2026/03/chatimage000001c.webp', COVER_BYTES, 'image/webp');

    chatVideoKey = '2026/03/chatclip0000001.mp4';
    const VIDEO_BYTES = Buffer.from('mp4-bytes-padding-to-32-bytes!');
    const assetVideo = prisma.seedMediaAsset({
      ownerId: buyer.user.id,
      type: MediaType.VIDEO,
      storageKey: chatVideoKey,
      thumbKey: '2026/03/chatclip0000001pt.webp',
      mime: 'video/mp4',
      sizeBytes: VIDEO_BYTES.length,
      durationMs: 4_000,
    });
    await storage.put(chatVideoKey, VIDEO_BYTES, 'video/mp4');
    await storage.put('2026/03/chatclip0000001pt.webp', POSTER_BYTES, 'image/webp');

    // Both assets become chat-attached through real sends.
    await sendMessage(buyer.token, conversationId, {
      type: 'IMAGE',
      mediaAssetId: assetImage.id,
    }).expect(201);
    await sendMessage(buyer.token, conversationId, {
      type: 'VIDEO',
      mediaAssetId: assetVideo.id,
    }).expect(201);

    // An authenticated NON-participant for the 403 arms.
    outsiderToken = (await loginAsBuyer()).token;
  });

  afterAll(async () => {
    await app.close();
    await rm(process.env.STORAGE_DIR ?? '', { recursive: true, force: true });
    delete process.env.STORAGE_DIR;
  });

  it('401 for anonymous callers (unchanged — the global guard)', async () => {
    await getSecure(undefined, chatImageKey).expect(401);
  });

  it('participant (the seller of the carrying thread) streams the asset — private, no-store', async () => {
    const response = await getSecure(sellerToken, chatImageKey).expect(200);
    expect(Buffer.from(response.body).equals(IMAGE_BYTES)).toBe(true);
    expect(response.headers['cache-control']).toBe('private, no-store');
  });

  it('authenticated NON-participant gets 403 SECURE_MEDIA_FORBIDDEN (the acceptance)', async () => {
    const response = await getSecure(outsiderToken, chatImageKey).expect(403);
    expect(response.body.code).toBe('SECURE_MEDIA_FORBIDDEN');
    await getSecure(outsiderToken, chatVideoKey).expect(403);
  });

  it('the video asset gates the same way for its owner (buyer, participant) — 200', async () => {
    await getSecure(buyerToken, chatVideoKey).expect(200);
  });

  it('VARIANT keys resolve the base asset: the cover {id}c.webp streams for a participant, 403 for an outsider', async () => {
    const participant = await getSecure(buyerToken, '2026/03/chatimage000001c.webp').expect(200);
    expect(Buffer.from(participant.body).equals(COVER_BYTES)).toBe(true);

    await getSecure(outsiderToken, '2026/03/chatimage000001c.webp').expect(403);
  });

  it('VARIANT keys resolve the base asset: the poster thumb {id}pt.webp streams for a participant', async () => {
    const response = await getSecure(buyerToken, '2026/03/chatclip0000001pt.webp').expect(200);
    expect(Buffer.from(response.body).equals(POSTER_BYTES)).toBe(true);
  });

  it('unreferenced assets keep the unchanged contract: authenticated 200 on the secure route', async () => {
    prisma.seedMediaAsset({
      ownerId: (await loginAsBuyer()).user.id,
      type: MediaType.IMAGE,
      storageKey: 'secure/2026/03/lonelyasset01.jpg',
      mime: 'image/jpeg',
      sizeBytes: 3,
    });
    await storage.put('secure/2026/03/lonelyasset01.jpg', Buffer.from('jpg'), 'image/jpeg');

    // The route assembles the key 'secure/' + path → exactly the stored key.
    await getSecure(buyerToken, '2026/03/lonelyasset01.jpg').expect(200);
  });

  it('the PUBLIC route is unchanged: it still streams the (public-pattern) asset anonymously', async () => {
    // Documented residual: chat uploads mint public-pattern keys, so the
    // bytes remain public-route reachable until chat-scoped uploads mint
    // secure/ keys (follow-up for a MEDIA card). The route contract itself
    // is untouched by CHT-007 — asserted here to pin that.
    const response = await request(app.getHttpServer())
      .get(`/media/${chatImageKey}`)
      .set('X-Forwarded-For', nextIp())
      .expect(200);
    expect(Buffer.from(response.body).equals(IMAGE_BYTES)).toBe(true);
  });

  it('splicing stays dead: a public key never resolves under the secure/ prefix (404)', async () => {
    // /media/secure/2026/03/… assembles the key 'secure/2026/03/…' — that
    // exact row was never stored and the prefix-strip is NOT applied to
    // secure/-prefixed keys (MEDIA-001 "no splicing" contract).
    await getSecure(outsiderToken, '2026/03/neverstored0001.png').expect(404);
  });
});
