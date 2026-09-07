import type { INestApplication } from '@nestjs/common';
import {
  AccountRole,
  ConversationStatus,
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
 * Messages controller e2e (CHT-003): POST /conversations/:id/messages (send),
 * GET /conversations/:id/messages (backwards cursor history) and
 * POST /conversations/:id/read, exercised through the real app (JWT guard,
 * global ThrottlerGuard, validation pipe, exception filter) over FakePrisma.
 * Covers the CHT-003 acceptance: a send moves the thread's list preview AND
 * the counterpart's unread (visible via GET /conversations), read zeroes it;
 * plus the full precondition matrix (401/404/403 non-participant/403
 * blocked/400 validation), the 429 send throttle (31st send in a minute) and
 * the backwards cursor walk over 3+ pages ending at the SYSTEM welcome.
 */
describe('MessagesController (e2e, CHT-003)', () => {
  let app: INestApplication;
  let prisma: FakePrisma;
  /** Fresh phone per login: the OTP send cap (3/hour/phone) must never trip. */
  let phoneCounter = 0;
  const nextPhone = (): string => `0961${String(++phoneCounter).padStart(7, '0')}`;
  /** Unique client IPs keep the per-IP throttle buckets isolated per test. */
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

  /** A real thread created through the CHT-001 API: buyer + seller + welcome. */
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

  const sendMessage = (
    token: string | undefined,
    conversationId: string,
    body: Record<string, unknown>,
    ip = nextIp(),
  ) =>
    request(app.getHttpServer())
      .post(`/conversations/${conversationId}/messages`)
      .set('Authorization', token === undefined ? '' : `Bearer ${token}`)
      .set('X-Forwarded-For', ip)
      .send(body);

  const listMessages = (token: string | undefined, conversationId: string, query = '') =>
    request(app.getHttpServer())
      .get(`/conversations/${conversationId}/messages${query}`)
      .set('Authorization', token === undefined ? '' : `Bearer ${token}`)
      .set('X-Forwarded-For', nextIp());

  const markRead = (token: string | undefined, conversationId: string) =>
    request(app.getHttpServer())
      .post(`/conversations/${conversationId}/read`)
      .set('Authorization', token === undefined ? '' : `Bearer ${token}`)
      .set('X-Forwarded-For', nextIp())
      .send({});

  const getInbox = (token: string | undefined) =>
    request(app.getHttpServer())
      .get('/conversations')
      .set('Authorization', token === undefined ? '' : `Bearer ${token}`)
      .set('X-Forwarded-For', nextIp());

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.prisma;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /conversations/:id/messages', () => {
    it('requires authentication (401 without a token)', async () => {
      await sendMessage(undefined, 'whatever-id', { body: 'سلام' }).expect(401);
    });

    it('404 for an unknown conversation id', async () => {
      const { token } = await loginAsBuyer();
      await sendMessage(token, 'missing-conversation', { body: 'سلام' }).expect(404);
    });

    it('403 NOT_PARTICIPANT for a known thread the caller takes no side of', async () => {
      const { conversationId } = await createThread();
      const outsider = await loginAsBuyer();
      const response = await sendMessage(outsider.token, conversationId, { body: 'سلام' }).expect(
        403,
      );
      expect(response.body.code).toBe('NOT_PARTICIPANT');
    });

    it('400 on validation: missing body, whitespace-only body, 2001 chars, and a non-TEXT type', async () => {
      const { buyer, conversationId } = await createThread();

      await sendMessage(buyer.token, conversationId, {}).expect(400);
      await sendMessage(buyer.token, conversationId, { body: '   ' }).expect(400); // trims to empty
      await sendMessage(buyer.token, conversationId, { body: 'خ'.repeat(2001) }).expect(400);
      await sendMessage(buyer.token, conversationId, {
        type: 'SYSTEM', // SYSTEM rows are server-written only
        body: 'سلام',
      }).expect(400);
    });

    it('creates the message (201) with EXACTLY the contracted payload keys — readAt starts null', async () => {
      const { buyer, conversationId } = await createThread();

      const response = await sendMessage(buyer.token, conversationId, {
        body: '  قیمت برای ۵ ستون چقدر می‌شود؟  ',
      }).expect(201);

      // The DTO trims — the stored body carries no surrounding whitespace.
      expect(response.body.body).toBe('قیمت برای ۵ ستون چقدر می‌شود؟');
      expect(response.body.conversationId).toBe(conversationId);
      expect(response.body.senderId).toBe(buyer.user.id);
      expect(response.body.type).toBe('TEXT');
      expect(response.body.readAt).toBeNull();
      expect(Object.keys(response.body).sort()).toEqual(
        [
          'body',
          'conversationId',
          'createdAt',
          'id',
          'mediaAssetId',
          'mediaPreviewKey',
          'mediaStorageKey',
          'readAt',
          'senderId',
          'type',
        ].sort(),
      );
    });

    it('accepts a body at the exact 2000-char boundary', async () => {
      const { buyer, conversationId } = await createThread();
      await sendMessage(buyer.token, conversationId, { body: 'خ'.repeat(2000) }).expect(201);
    });

    it('CHT-003 ACCEPTANCE: a buyer send moves the list preview and the SELLER unread (both roles, mirrored)', async () => {
      const { buyer, seller, conversationId } = await createThread();

      await sendMessage(buyer.token, conversationId, {
        body: 'قیمت برای ۵ ستون چقدر می‌شود؟',
      }).expect(201);

      const sellerInbox = await getInbox(seller.token).expect(200);
      const sellerItem = sellerInbox.body.items.find(
        (item: { id: string }) => item.id === conversationId,
      );
      expect(sellerItem.lastMessagePreview).toBe('قیمت برای ۵ ستون چقدر می‌شود؟');
      expect(sellerItem.myUnreadCount).toBe(1); // the counterpart counter incremented
      expect(sellerItem.isLastMessageSystem).toBe(false); // the newest row is now a user TEXT

      const buyerInbox = await getInbox(buyer.token).expect(200);
      const buyerItem = buyerInbox.body.items.find(
        (item: { id: string }) => item.id === conversationId,
      );
      expect(buyerItem.myUnreadCount).toBe(0); // my own send never unreads me
    });

    it('truncates the stored list preview to the 80-char bound (+ ellipsis)', async () => {
      const { buyer, seller, conversationId } = await createThread();
      await sendMessage(buyer.token, conversationId, { body: 'خ'.repeat(2000) }).expect(201);

      const sellerInbox = await getInbox(seller.token).expect(200);
      const item = sellerInbox.body.items.find(
        (item: { id: string }) => item.id === conversationId,
      );
      expect(item.lastMessagePreview?.length).toBe(81);
      expect(item.lastMessagePreview?.endsWith('…')).toBe(true);
    });

    it('403 CONVERSATION_BLOCKED: neither side of a BLOCKED thread can send', async () => {
      const { buyer, seller, conversationId } = await createThread();
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { status: ConversationStatus.BLOCKED },
      });

      const buyerError = await sendMessage(buyer.token, conversationId, { body: 'سلام' }).expect(
        403,
      );
      expect(buyerError.body.code).toBe('CONVERSATION_BLOCKED');
      await sendMessage(seller.token, conversationId, { body: 'سلام' }).expect(403);
    });

    it('429 on the 31st send within a minute (throttle 30/min, code TOO_MANY_REQUESTS)', async () => {
      const { buyer, conversationId } = await createThread();
      // One shared client IP = one throttle bucket for this handler.
      const sharedIp = nextIp();
      for (let index = 0; index < 30; index += 1) {
        await sendMessage(buyer.token, conversationId, { body: `پیام ${index}` }, sharedIp).expect(
          201,
        );
      }
      const throttled = await sendMessage(
        buyer.token,
        conversationId,
        { body: 'یکی بیشتر' },
        sharedIp,
      ).expect(429);
      expect(throttled.body.code).toBe('TOO_MANY_REQUESTS');
    }, 30_000);
  });

  describe('GET /conversations/:id/messages', () => {
    it('requires authentication (401 without a token)', async () => {
      await listMessages(undefined, 'whatever-id').expect(401);
    });

    it('404 for an unknown conversation id / 403 for a foreign one', async () => {
      const { token } = await loginAsBuyer();
      await listMessages(token, 'missing-conversation').expect(404);
      const { conversationId } = await createThread();
      const outsider = await loginAsBuyer();
      await listMessages(outsider.token, conversationId).expect(403);
    });

    it('400 for a `before` cursor that is not a message of this conversation', async () => {
      const { buyer, conversationId } = await createThread();
      await listMessages(buyer.token, conversationId, '?before=no-such-message').expect(400);
    });

    it('serves the full history ASC (SYSTEM welcome included) with the cursor-page key set', async () => {
      const { buyer, conversationId } = await createThread();
      await sendMessage(buyer.token, conversationId, { body: 'سلام' }).expect(201);

      const response = await listMessages(buyer.token, conversationId).expect(200);

      expect(response.body.hasMore).toBe(false);
      expect(response.body.nextCursor).toBeNull();
      expect(response.body.items).toHaveLength(2);
      expect(response.body.items[0].type).toBe('SYSTEM'); // the welcome is history's first row
      expect(response.body.items[0].senderId).toBeNull();
      expect(response.body.items[1].body).toBe('سلام');
      expect(response.body.items[1].createdAt >= response.body.items[0].createdAt).toBe(true);
      expect(Object.keys(response.body).sort()).toEqual(['hasMore', 'items', 'nextCursor'].sort());
      expect(Object.keys(response.body.items[0]).sort()).toEqual(
        [
          'body',
          'conversationId',
          'createdAt',
          'id',
          'mediaAssetId',
          'mediaPreviewKey',
          'mediaStorageKey',
          'readAt',
          'senderId',
          'type',
        ].sort(),
      );
    });

    it('paginates BACKWARDS across 3+ pages: ASC pages ending at the cursor drain to hasMore=false', async () => {
      const { buyer, conversationId } = await createThread();
      for (let index = 0; index < 7; index += 1) {
        await sendMessage(buyer.token, conversationId, { body: `پیام ${index + 1}` }).expect(201);
      }
      // The store's full ASC history is the ground truth (welcome + 7 sends).
      const stored = await prisma.message.findMany({
        where: { conversationId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      expect(stored).toHaveLength(8);

      // The walk returns the NEWEST block first (chat history loads backwards),
      // so full ASC = last block + … + first block, ASC within each block.
      const blocks: string[][] = [];
      let before: string | undefined;
      for (;;) {
        const query = `?limit=3${before === undefined ? '' : `&before=${before}`}`;
        const response = await listMessages(buyer.token, conversationId, query).expect(200);
        blocks.push(response.body.items.map((item: { id: string }) => item.id));
        if (response.body.hasMore) {
          expect(response.body.items).toHaveLength(3);
          before = response.body.nextCursor;
          expect(before).toBe(response.body.items[0].id); // oldest of THIS page
        } else {
          expect(response.body.nextCursor).toBeNull();
          break;
        }
        expect(blocks.length).toBeLessThan(10); // never loop forever
      }

      expect(blocks).toHaveLength(3); // 8 rows / limit 3 → 3 pages
      expect(blocks.reverse().flat()).toEqual(stored.map((message) => message.id)); // full history, no gaps/dupes
    });

    it('treats the cursor strictly: the `before` message itself is not repeated', async () => {
      const { buyer, conversationId } = await createThread();
      const first = await sendMessage(buyer.token, conversationId, { body: 'پیام ۱' }).expect(201);
      await sendMessage(buyer.token, conversationId, { body: 'پیام ۲' }).expect(201);

      const response = await listMessages(
        buyer.token,
        conversationId,
        `?before=${first.body.id}`,
      ).expect(200);

      expect(response.body.items.map((item: { id: string }) => item.id)).not.toContain(
        first.body.id,
      );
      expect(response.body.items).toHaveLength(1); // only the welcome is older
    });
  });

  describe('POST /conversations/:id/read', () => {
    it('requires authentication (401 without a token)', async () => {
      await markRead(undefined, 'whatever-id').expect(401);
    });

    it('404 for an unknown conversation id / 403 for a foreign one', async () => {
      const { token } = await loginAsBuyer();
      await markRead(token, 'missing-conversation').expect(404);
      const { conversationId } = await createThread();
      const outsider = await loginAsBuyer();
      await markRead(outsider.token, conversationId).expect(403);
    });

    it('CHT-003 ACCEPTANCE: reading zeroes my unread counter and stamps the counterpart messages', async () => {
      const { buyer, seller, conversationId } = await createThread();
      const sent = await sendMessage(buyer.token, conversationId, { body: 'سلام' }).expect(201);
      expect((await getInbox(seller.token).expect(200)).body.items[0].myUnreadCount).toBe(1);

      const response = await markRead(seller.token, conversationId).expect(200);

      expect(response.body.readCount).toBe(1); // the one unread buyer row stamped
      const sellerInbox = await getInbox(seller.token).expect(200);
      expect(sellerInbox.body.items[0].myUnreadCount).toBe(0); // the counter zeroed

      const stored = await prisma.message.findUnique({ where: { id: sent.body.id } });
      expect(stored?.readAt).not.toBeNull();

      // Idempotent: a second read has nothing left to stamp.
      const again = await markRead(seller.token, conversationId).expect(200);
      expect(again.body.readCount).toBe(0);
    });

    it('does not touch the OTHER side: my read zeroes MY counter only and never stamps my own rows', async () => {
      const { buyer, seller, conversationId } = await createThread();
      // Both sides spoke → EACH counter is at 1.
      await sendMessage(seller.token, conversationId, { body: 'بله موجود است' }).expect(201);
      await sendMessage(buyer.token, conversationId, { body: 'سلام' }).expect(201);

      await markRead(buyer.token, conversationId).expect(200);

      const buyerInbox = await getInbox(buyer.token).expect(200);
      expect(buyerInbox.body.items[0].myUnreadCount).toBe(0); // MY counter zeroed
      const sellerInbox = await getInbox(seller.token).expect(200);
      expect(sellerInbox.body.items[0].myUnreadCount).toBe(1); // the SELLER's counter untouched
      const myOwnRows = await prisma.message.findMany({
        where: { conversationId, senderId: buyer.user.id },
      });
      expect(myOwnRows).toHaveLength(1);
      expect(myOwnRows.every((message) => message.readAt === null)).toBe(true); // buyer read ≠ buyer's own rows
    });
  });

  describe('CHT-007 — media messages (POST extended + history keys)', () => {
    /** Seeds a chat asset owned by `owner` (public-pattern key — MEDIA-002/003
     * uploads mint these; the secure route reaches them behind the gate). */
    const seedAsset = (owner: string, type: MediaType, key: string) =>
      prisma.seedMediaAsset({
        ownerId: owner,
        type,
        storageKey: key,
        thumbKey: type === MediaType.IMAGE ? `${key.replace(/\.\w+$/, 'c.webp')}` : undefined,
        mime: type === MediaType.IMAGE ? 'image/png' : 'video/mp4',
        sizeBytes: 256,
      });

    it('creates an IMAGE message (201) with the media keys, «📷 تصویر» preview and counterpart unread', async () => {
      const { buyer, seller, conversationId } = await createThread();
      const asset = seedAsset(buyer.user.id, MediaType.IMAGE, '2026/07/photo0001.png');

      const response = await sendMessage(buyer.token, conversationId, {
        type: 'IMAGE',
        mediaAssetId: asset.id,
      }).expect(201);

      expect(response.body.type).toBe('IMAGE');
      expect(response.body.body).toBeNull();
      expect(response.body.mediaAssetId).toBe(asset.id);
      expect(response.body.mediaStorageKey).toBe('2026/07/photo0001.png');
      expect(response.body.mediaPreviewKey).toBe('2026/07/photo0001c.webp'); // cover variant

      const sellerInbox = await getInbox(seller.token).expect(200);
      const item = sellerInbox.body.items.find((it: { id: string }) => it.id === conversationId);
      expect(item.lastMessagePreview).toBe('📷 تصویر'); // the fa placeholder (documented)
      expect(item.myUnreadCount).toBe(1);
    });

    it('403 MEDIA_NOT_OWNED for a foreign asset and uniformly for a missing one', async () => {
      const { buyer, conversationId } = await createThread();
      const outsider = await loginAsBuyer();
      const foreignAsset = seedAsset(outsider.user.id, MediaType.IMAGE, '2026/07/foreign1.png');

      const foreign = await sendMessage(buyer.token, conversationId, {
        type: 'IMAGE',
        mediaAssetId: foreignAsset.id,
      }).expect(403);
      expect(foreign.body.code).toBe('MEDIA_NOT_OWNED');

      const missing = await sendMessage(buyer.token, conversationId, {
        type: 'IMAGE',
        mediaAssetId: 'no-such-asset',
      }).expect(403);
      expect(missing.body.code).toBe('MEDIA_NOT_OWNED');
    });

    it('400 for the payload invariants: no body on TEXT, body on media, mediaAssetId on TEXT, missing mediaAssetId, type mismatch', async () => {
      const { buyer, conversationId } = await createThread();
      const imageAsset = seedAsset(buyer.user.id, MediaType.IMAGE, '2026/07/photo0002.png');
      const videoAsset = seedAsset(buyer.user.id, MediaType.VIDEO, '2026/07/clip0001.mp4');

      const noBody = await sendMessage(buyer.token, conversationId, {}).expect(400);
      expect(noBody.body.code).toBe('MESSAGE_BODY_REQUIRED');

      const mediaWithBody = await sendMessage(buyer.token, conversationId, {
        type: 'IMAGE',
        mediaAssetId: imageAsset.id,
        body: 'نگاه کن',
      }).expect(400);
      expect(mediaWithBody.body.code).toBe('MEDIA_BODY_FORBIDDEN');

      const textWithAsset = await sendMessage(buyer.token, conversationId, {
        body: 'سلام',
        mediaAssetId: imageAsset.id,
      }).expect(400);
      expect(textWithAsset.body.code).toBe('MEDIA_ASSET_WITH_TEXT');

      const missingAsset = await sendMessage(buyer.token, conversationId, {
        type: 'IMAGE',
      }).expect(400);
      expect(missingAsset.body.code).toBe('MEDIA_ASSET_REQUIRED');

      const mismatch = await sendMessage(buyer.token, conversationId, {
        type: 'VIDEO',
        mediaAssetId: imageAsset.id,
      }).expect(400);
      expect(mismatch.body.code).toBe('MEDIA_TYPE_MISMATCH');
      expect(videoAsset.type).toBe(MediaType.VIDEO);
    });

    it('serves the media keys back through the history page', async () => {
      const { buyer, conversationId } = await createThread();
      const asset = seedAsset(buyer.user.id, MediaType.IMAGE, '2026/07/photo0003.png');
      const sent = await sendMessage(buyer.token, conversationId, {
        type: 'IMAGE',
        mediaAssetId: asset.id,
      }).expect(201);

      const response = await listMessages(buyer.token, conversationId).expect(200);
      const last = response.body.items.at(-1);
      expect(last.id).toBe(sent.body.id);
      expect(last.mediaStorageKey).toBe('2026/07/photo0003.png');
      expect(last.mediaPreviewKey).toBe('2026/07/photo0003c.webp');
    });
  });
});
