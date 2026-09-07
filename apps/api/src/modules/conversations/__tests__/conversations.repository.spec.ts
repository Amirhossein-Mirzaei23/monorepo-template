import {
  LiquidationReason,
  LotCondition,
  LotStatus,
  MediaType,
  MessageType,
  PricingType,
} from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';
import { FakePrisma } from '../../../test/fakes/fake-prisma';
import { ConversationsRepository, CONVERSATION_LIST_INCLUDE } from '../conversations.repository';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const BASE_TIME = new Date('2026-09-01T10:00:00.000Z');

/**
 * ConversationsRepository unit specs (CHT-002) — the inbox page read:
 * participant union (buyerId = me OR sellerId = me), newest-activity order
 * with a deterministic tiebreak, skip/take pagination, the joined row shape
 * (lot/cover + both participant summaries + latest message) and the
 * 2-query-max-per-page budget (ONE findMany + ONE count; batched relations
 * ride the findMany).
 */
describe('ConversationsRepository', () => {
  let fake: FakePrisma;
  let repository: ConversationsRepository;
  let buyerId: string;
  let sellerId: string;
  let outsiderId: string;
  let lotCounter = 0;

  const seedActiveLot = (ownerId: string) => {
    lotCounter += 1;
    return fake.seedLot({
      sellerId: ownerId,
      categoryId: 'cat-1',
      title: `عمده لات ${lotCounter}`,
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
      expiresAt: new Date(BASE_TIME.getTime() + 30 * DAY_MS),
    });
  };

  /** Conversation + its welcome SYSTEM message (the CHT-001 write shape). */
  const seedThread = (overrides: {
    lotId: string;
    buyerId: string;
    sellerId: string;
    lastMessageAt: Date;
    lastMessagePreview?: string;
    buyerUnreadCount?: number;
    sellerUnreadCount?: number;
  }) => {
    const conversation = fake.seedConversation(overrides);
    fake.seedMessage({
      conversationId: conversation.id,
      senderId: null,
      type: MessageType.SYSTEM,
      body: overrides.lastMessagePreview ?? 'گفتگو درباره: …',
      createdAt: overrides.lastMessageAt,
    });
    return conversation;
  };

  beforeAll(() => {
    jest.useFakeTimers({ now: BASE_TIME });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    fake = new FakePrisma();
    repository = new ConversationsRepository(fake as unknown as PrismaService);
    buyerId = fake.seedUser({ phone: '09121110000', name: 'خریدار' }).id;
    sellerId = fake.seedUser({ phone: '09122220000', name: 'فروشنده' }).id;
    outsiderId = fake.seedUser({ phone: '09123330000', name: 'غریبه' }).id;
  });

  describe('findForUser — participant union', () => {
    it('returns threads where the user is the buyer OR the seller (both roles in one list)', async () => {
      const boughtLot = seedActiveLot(sellerId);
      const soldLot = seedActiveLot(outsiderId);
      seedThread({
        lotId: boughtLot.id,
        buyerId,
        sellerId,
        lastMessageAt: new Date(BASE_TIME.getTime() - 2 * HOUR_MS),
      });
      seedThread({
        lotId: soldLot.id,
        buyerId: sellerId, // the same user BUYS here…
        sellerId: outsiderId,
        lastMessageAt: new Date(BASE_TIME.getTime() - 1 * HOUR_MS),
      });

      // …while SELLING on the first thread — one inbox, both roles.
      const result = await repository.findForUser(sellerId, { page: 1, limit: 20 });

      expect(result.total).toBe(2);
      expect(result.items.map((row) => row.buyerId)).toEqual([sellerId, buyerId]); // newest first
    });

    it('returns NOTHING for a non-participant (no oracle into other people inboxes)', async () => {
      const lot = seedActiveLot(sellerId);
      seedThread({ lotId: lot.id, buyerId, sellerId, lastMessageAt: BASE_TIME });

      const result = await repository.findForUser(outsiderId, { page: 1, limit: 20 });

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('findForUser — order + pagination', () => {
    it('orders by lastMessageAt DESC (newest activity first, welcome stamps included)', async () => {
      const older = seedActiveLot(sellerId);
      const newer = seedActiveLot(sellerId);
      const newest = seedActiveLot(sellerId);
      seedThread({
        lotId: older.id,
        buyerId,
        sellerId,
        lastMessageAt: new Date(BASE_TIME.getTime() - 3 * HOUR_MS),
      });
      seedThread({
        lotId: newest.id,
        buyerId,
        sellerId,
        lastMessageAt: new Date(BASE_TIME.getTime() - 1 * HOUR_MS),
      });
      seedThread({
        lotId: newer.id,
        buyerId,
        sellerId,
        lastMessageAt: new Date(BASE_TIME.getTime() - 2 * HOUR_MS),
      });

      const result = await repository.findForUser(buyerId, { page: 1, limit: 20 });

      expect(result.items.map((row) => row.lotId)).toEqual([newest.id, newer.id, older.id]);
    });

    it('breaks lastMessageAt ties deterministically by id DESC (pages never duplicate/skip)', async () => {
      const first = seedActiveLot(sellerId);
      const second = seedActiveLot(sellerId);
      const tied = new Date(BASE_TIME.getTime() - 1 * HOUR_MS);
      const threadA = seedThread({ lotId: first.id, buyerId, sellerId, lastMessageAt: tied });
      const threadB = seedThread({ lotId: second.id, buyerId, sellerId, lastMessageAt: tied });

      const page1 = await repository.findForUser(buyerId, { page: 1, limit: 1 });
      const page1Again = await repository.findForUser(buyerId, { page: 1, limit: 1 });
      const page2 = await repository.findForUser(buyerId, { page: 2, limit: 1 });

      // A total order exists: page boundaries are stable across repeats and
      // the two pages partition the tied threads without overlap.
      expect(page1.items.map((row) => row.id)).toEqual(page1Again.items.map((row) => row.id));
      expect(page2.items.map((row) => row.id)).not.toEqual(page1.items.map((row) => row.id));
      expect(new Set([...page1.items, ...page2.items].map((row) => row.id))).toEqual(
        new Set([threadA.id, threadB.id]),
      );
      expect(page1.total).toBe(2);
    });

    it('paginates: skip/take slice with the FULL match count in total', async () => {
      for (let index = 0; index < 3; index += 1) {
        const lot = seedActiveLot(sellerId);
        seedThread({
          lotId: lot.id,
          buyerId,
          sellerId,
          lastMessageAt: new Date(BASE_TIME.getTime() - (index + 1) * HOUR_MS),
        });
      }

      const page2 = await repository.findForUser(buyerId, { page: 2, limit: 2 });

      expect(page2.page).toBe(2);
      expect(page2.limit).toBe(2);
      expect(page2.total).toBe(3);
      expect(page2.items).toHaveLength(1); // the oldest thread alone on page 2
    });
  });

  describe('findForUser — joined row shape', () => {
    it('returns the mapper include: lot (code/price/status + cover link), BOTH participants, latest message', async () => {
      const lot = seedActiveLot(sellerId);
      const asset = fake.seedMediaAsset({
        ownerId: sellerId,
        type: MediaType.IMAGE,
        mime: 'image/jpeg',
        sizeBytes: 10,
        storageKey: '2026/09/original.jpg',
        thumbKey: '2026/09/thumb.webp',
      });
      fake.seedLotMedia({ lotId: lot.id, mediaAssetId: asset.id, sortOrder: 0, isCover: true });
      const conversation = seedThread({
        lotId: lot.id,
        buyerId,
        sellerId,
        lastMessageAt: BASE_TIME,
        lastMessagePreview: 'گفتگو درباره: عمده لات ۱ — ۱۰۰٬۰۰۰ تومان',
      });

      const result = await repository.findForUser(buyerId, { page: 1, limit: 20 });
      const row = result.items[0];

      expect(row?.id).toBe(conversation.id);
      expect(row?.lot.code).toBe(lot.code);
      expect(row?.lot.unitPrice).toBe(100_000);
      expect(row?.lot.status).toBe(LotStatus.ACTIVE);
      expect(row?.lot.media).toHaveLength(1);
      expect(row?.lot.media[0]?.isCover).toBe(true);
      expect(row?.buyer).toEqual({ id: buyerId, name: 'خریدار' });
      expect(row?.seller).toEqual({ id: sellerId, name: 'فروشنده' });
      expect(row?.messages).toHaveLength(1);
      expect(row?.messages[0]?.type).toBe(MessageType.SYSTEM);
      expect(Object.keys(CONVERSATION_LIST_INCLUDE).sort()).toEqual(
        ['buyer', 'lot', 'messages', 'seller'].sort(),
      );
    });

    it('picks the NEWEST message for the system flag (later TEXT beats the welcome SYSTEM)', async () => {
      const lot = seedActiveLot(sellerId);
      const conversation = seedThread({
        lotId: lot.id,
        buyerId,
        sellerId,
        lastMessageAt: new Date(BASE_TIME.getTime() - 1 * HOUR_MS),
        lastMessagePreview: 'قیمت برای ۵ ستون چقدر می‌شود؟',
      });
      fake.seedMessage({
        conversationId: conversation.id,
        senderId: buyerId,
        type: MessageType.TEXT,
        body: 'قیمت برای ۵ ستون چقدر می‌شود؟',
        createdAt: BASE_TIME, // one hour AFTER the welcome message
      });

      const result = await repository.findForUser(buyerId, { page: 1, limit: 20 });

      expect(result.items[0]?.messages[0]?.type).toBe(MessageType.TEXT);
    });

    it('returns an empty messages join for a thread with no rows (defensive — CHT-001 always writes a welcome)', async () => {
      const lot = seedActiveLot(sellerId);
      fake.seedConversation({ lotId: lot.id, buyerId, sellerId, lastMessageAt: BASE_TIME });

      const result = await repository.findForUser(buyerId, { page: 1, limit: 20 });

      expect(result.items[0]?.messages).toEqual([]);
    });
  });

  describe('findForUser — 2-query-max per page', () => {
    it('issues EXACTLY one findMany + one count per page read (relations are batched includes)', async () => {
      const lot = seedActiveLot(sellerId);
      seedThread({ lotId: lot.id, buyerId, sellerId, lastMessageAt: BASE_TIME });
      const findMany = jest.spyOn(fake.conversation, 'findMany');
      const count = jest.spyOn(fake.conversation, 'count');

      await repository.findForUser(buyerId, { page: 1, limit: 20 });

      expect(findMany).toHaveBeenCalledTimes(1);
      expect(count).toHaveBeenCalledTimes(1);
      const args = findMany.mock.calls[0]?.[0];
      expect(args?.where).toEqual({ OR: [{ buyerId: buyerId }, { sellerId: buyerId }] });
      expect(args?.orderBy).toEqual([{ lastMessageAt: 'desc' }, { id: 'desc' }]);
      expect(args?.skip).toBe(0);
      expect(args?.take).toBe(20);
    });
  });
});
