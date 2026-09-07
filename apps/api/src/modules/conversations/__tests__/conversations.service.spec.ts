import { ConfigService } from '@nestjs/config';
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AccountRole,
  ConversationStatus,
  LiquidationReason,
  LotCondition,
  LotStatus,
  MediaType,
  MessageType,
  PricingType,
} from '@prisma/client';
import type { AppConfig } from '../../../config/configuration';
import type { PrismaService } from '../../../prisma/prisma.service';
import { FakePrisma } from '../../../test/fakes/fake-prisma';
import { LotsRepository } from '../../lots/lots.repository';
import { UsersRepository } from '../../users/users.repository';
import {
  CONVERSATION_ERROR_CODES,
  CONVERSATION_PREVIEW_MAX_LENGTH,
} from '../conversations.constants';
import { ConversationsRepository } from '../conversations.repository';
import { ConversationsService } from '../conversations.service';
import { ConversationListQueryDto } from '../dto/conversation-list.dto';

const MEDIA_BASE_URL = 'http://media.test';
const DAY_MS = 24 * 60 * 60 * 1000;

/** Grabs the rejection instead of try/catch noise in every test. */
async function rejectionOf(promise: Promise<unknown>): Promise<HttpException> {
  return promise.then(
    () => {
      throw new Error('expected the promise to reject');
    },
    (error: HttpException) => error,
  );
}

/** The exact fa-formatted price the welcome body carries (same ICU as production). */
const faToman = (amount: number): string =>
  `${new Intl.NumberFormat('fa-IR').format(amount)} تومان`;

describe('ConversationsService', () => {
  let service: ConversationsService;
  let repository: ConversationsRepository;
  let fake: FakePrisma;
  let sellerId: string;
  let buyerId: string;

  const seedActiveLot = (ownerId: string = sellerId) =>
    fake.seedLot({
      sellerId: ownerId,
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

  beforeEach(() => {
    fake = new FakePrisma();
    repository = new ConversationsRepository(fake as unknown as PrismaService);
    const users = new UsersRepository(fake as unknown as PrismaService);
    const lots = new LotsRepository(fake as unknown as PrismaService);
    // Minimal `app` namespace stub — the response mapper reads PUBLIC_MEDIA_BASE_URL.
    const appConfig = { storage: { publicMediaBaseUrl: MEDIA_BASE_URL } } as unknown as AppConfig;
    const config = {
      get: (key: string) => (key === 'app' ? appConfig : undefined),
    } as unknown as ConfigService;
    service = new ConversationsService(
      repository,
      users,
      lots,
      fake as unknown as PrismaService,
      config,
    );

    sellerId = fake.seedUser({
      phone: '09121110000',
      name: 'فروشنده',
      accountRoles: [AccountRole.SELLER],
    }).id;
    buyerId = fake.seedUser({
      phone: '09122220000',
      name: 'خریدار',
      accountRoles: [AccountRole.BUYER],
    }).id;
  });

  describe('getOrCreate — happy path (create)', () => {
    it('creates the conversation ACTIVE, seller derived from the lot, welcome SYSTEM message stored', async () => {
      const lot = seedActiveLot();
      const before = Date.now();

      const response = await service.getOrCreate(buyerId, { lotId: lot.id });

      expect(response.id).toBeDefined();
      expect(response.lotId).toBe(lot.id);
      expect(response.buyerId).toBe(buyerId);
      expect(response.sellerId).toBe(sellerId); // DERIVED — the body has no sellerId
      expect(response.status).toBe(ConversationStatus.ACTIVE);
      expect(response.lot).toEqual({
        code: lot.code,
        title: lot.title,
        coverThumbUrl: null,
        unitPrice: 2_250_000,
        status: LotStatus.ACTIVE,
      });

      const row = await fake.conversation.findUnique({ where: { id: response.id } });
      expect(row?.status).toBe(ConversationStatus.ACTIVE);
      expect(row?.buyerUnreadCount).toBe(0);
      expect(row?.sellerUnreadCount).toBe(0);
      expect(row?.lastMessageAt.getTime()).toBeGreaterThanOrEqual(before - 1_000);

      const messages = await fake.message.findMany({
        where: { conversationId: response.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(messages).toHaveLength(1);
      expect(messages[0]?.type).toBe(MessageType.SYSTEM);
      expect(messages[0]?.senderId).toBeNull(); // sender null = system (plan §3)
      expect(messages[0]?.body).toBe(`گفتگو درباره: ${lot.title} — ${faToman(2_250_000)}`);
      expect(row?.lastMessagePreview).toBe(messages[0]?.body); // short body → preview = body
    });

    it('resolves the lot cover thumb against PUBLIC_MEDIA_BASE_URL (thumbKey first)', async () => {
      const lot = seedActiveLot();
      const asset = fake.seedMediaAsset({
        ownerId: sellerId,
        type: MediaType.IMAGE,
        mime: 'image/jpeg',
        sizeBytes: 10,
        storageKey: '2026/09/original.jpg',
        thumbKey: '2026/09/thumb.webp',
      });
      fake.seedLotMedia({ lotId: lot.id, mediaAssetId: asset.id, sortOrder: 0, isCover: true });

      const response = await service.getOrCreate(buyerId, { lotId: lot.id });
      expect(response.lot.coverThumbUrl).toBe(`${MEDIA_BASE_URL}/2026/09/thumb.webp`);
    });

    it('falls back to the cover storageKey when no thumb variant exists', async () => {
      const lot = seedActiveLot();
      const asset = fake.seedMediaAsset({
        ownerId: sellerId,
        type: MediaType.IMAGE,
        mime: 'image/jpeg',
        sizeBytes: 10,
        storageKey: '2026/09/original.jpg',
      });
      fake.seedLotMedia({ lotId: lot.id, mediaAssetId: asset.id, sortOrder: 0, isCover: true });

      const response = await service.getOrCreate(buyerId, { lotId: lot.id });
      expect(response.lot.coverThumbUrl).toBe(`${MEDIA_BASE_URL}/2026/09/original.jpg`);
    });

    it('truncates lastMessagePreview to the 80-char inbox bound (+ ellipsis)', async () => {
      const lot = fake.seedLot({
        sellerId,
        categoryId: 'cat-1',
        title: 'ک'.repeat(100), // 100-code-point title → welcome body > 80
        quantity: 5,
        availableQuantity: 5,
        minOrderQuantity: 1,
        pricingType: PricingType.FIXED,
        totalPrice: 100_000,
        unitPrice: 20_000,
        condition: LotCondition.NEW,
        liquidationReason: LiquidationReason.OTHER,
        province: 'tehran',
        city: 'tehran',
        status: LotStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 30 * DAY_MS),
      });

      const response = await service.getOrCreate(buyerId, { lotId: lot.id });
      const row = await fake.conversation.findUnique({ where: { id: response.id } });
      expect(row?.lastMessagePreview).toBeDefined();
      expect(row?.lastMessagePreview?.length).toBe(CONVERSATION_PREVIEW_MAX_LENGTH + 1);
      expect(row?.lastMessagePreview?.endsWith('…')).toBe(true);
    });
  });

  describe('getOrCreate — idempotency', () => {
    it('returns the SAME conversation on the second call and does not duplicate rows or the welcome message', async () => {
      const lot = seedActiveLot();
      const first = await service.getOrCreate(buyerId, { lotId: lot.id });
      const second = await service.getOrCreate(buyerId, { lotId: lot.id });

      expect(second.id).toBe(first.id);
      expect(second.createdAt).toEqual(first.createdAt);

      const messages = await fake.message.findMany({ where: { conversationId: first.id } });
      expect(messages).toHaveLength(1); // no second welcome
      expect(await fake.message.count({ where: { senderId: null } })).toBe(1);
    });

    it('wins the P2002 race by re-reading the existing conversation (concurrent get-or-create)', async () => {
      const lot = seedActiveLot();
      const existing = await service.getOrCreate(buyerId, { lotId: lot.id });

      // Simulate the race: the pre-create lookup misses (concurrent insert lands
      // right after), the INSERT hits unique(lotId, buyerId) → P2002 → re-read.
      jest.spyOn(repository, 'findByLotAndBuyer').mockImplementationOnce(async () => null);

      const raced = await service.getOrCreate(buyerId, { lotId: lot.id });
      expect(raced.id).toBe(existing.id);
      const messages = await fake.message.findMany({ where: { conversationId: existing.id } });
      expect(messages).toHaveLength(1); // the loser must not add a second welcome
      jest.restoreAllMocks();
    });
  });

  describe('getOrCreate — precondition chain (order: BUYER → 404 → SELF → INACTIVE)', () => {
    it('rejects a user without the BUYER hat (403 BUYER_REQUIRED) before any lot probing', async () => {
      const noHatId = fake.seedUser({ phone: '09123330000', name: 'بی‌نقش' }).id;
      const lot = seedActiveLot();
      // Even a MISSING lot must answer the hat error first (hats before probing).
      const error = await rejectionOf(service.getOrCreate(noHatId, { lotId: 'no-such-lot' }));
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error.getResponse() as { code?: string }).code).toBe(
        CONVERSATION_ERROR_CODES.BUYER_REQUIRED,
      );

      const sellerOnlyError = await rejectionOf(service.getOrCreate(sellerId, { lotId: lot.id }));
      expect((sellerOnlyError.getResponse() as { code?: string }).code).toBe(
        CONVERSATION_ERROR_CODES.BUYER_REQUIRED,
      );
    });

    it('rejects when the token user no longer exists (401)', async () => {
      await expect(service.getOrCreate('ghost-id', { lotId: 'x' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects an unknown lot with 404', async () => {
      await expect(service.getOrCreate(buyerId, { lotId: 'missing-lot' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects the seller of the lot with 403 SELF_CONVERSATION — even with the BUYER hat too', async () => {
      const lot = seedActiveLot();
      await fake.user.update({
        where: { id: sellerId },
        data: { accountRoles: [AccountRole.SELLER, AccountRole.BUYER] },
      });

      const error = await rejectionOf(service.getOrCreate(sellerId, { lotId: lot.id }));
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error.getResponse() as { code?: string }).code).toBe(
        CONVERSATION_ERROR_CODES.SELF_CONVERSATION,
      );
    });

    it.each([
      ['DRAFT', LotStatus.DRAFT],
      ['PENDING_REVIEW', LotStatus.PENDING_REVIEW],
      ['PAUSED', LotStatus.PAUSED],
      ['REJECTED', LotStatus.REJECTED],
      ['EXPIRED', LotStatus.EXPIRED],
      ['SOLD', LotStatus.SOLD],
      ['REMOVED', LotStatus.REMOVED],
    ])('rejects a %s lot with 409 INACTIVE_LOT (nothing written)', async (_label, status) => {
      const lot = seedActiveLot();
      await fake.lot.update({ where: { id: lot.id }, data: { status } });

      const error = await rejectionOf(service.getOrCreate(buyerId, { lotId: lot.id }));
      expect(error).toBeInstanceOf(ConflictException);
      expect((error.getResponse() as { code?: string }).code).toBe(
        CONVERSATION_ERROR_CODES.INACTIVE_LOT,
      );
      expect(await fake.message.count({})).toBe(0);
    });
  });

  describe('findMine — the participant inbox (CHT-002)', () => {
    /** Conversation + its welcome SYSTEM message (the CHT-001 write shape). */
    const seedThread = (overrides: {
      buyerId: string;
      sellerId: string;
      lastMessageAt?: Date;
      buyerUnreadCount?: number;
      sellerUnreadCount?: number;
    }) => {
      const lot = seedActiveLot(overrides.sellerId);
      const lastMessageAt = overrides.lastMessageAt ?? new Date('2026-09-01T10:00:00.000Z');
      const conversation = fake.seedConversation({
        lotId: lot.id,
        buyerId: overrides.buyerId,
        sellerId: overrides.sellerId,
        lastMessageAt,
        lastMessagePreview: 'گفتگو درباره: عمده پیراهن مردانه — ۲٬۲۵۰٬۰۰۰ تومان',
        buyerUnreadCount: overrides.buyerUnreadCount,
        sellerUnreadCount: overrides.sellerUnreadCount,
      });
      fake.seedMessage({
        conversationId: conversation.id,
        senderId: null,
        type: MessageType.SYSTEM,
        body: 'گفتگو درباره: عمده پیراهن مردانه — ۲٬۲۵۰٬۰۰۰ تومان',
        createdAt: lastMessageAt,
      });
      return { lot, conversation };
    };

    it('rejects a token user that no longer exists (401) before any read', async () => {
      await expect(
        service.findMine('ghost-id', new ConversationListQueryDto()),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(await fake.conversation.count({})).toBe(0);
    });

    it('maps the BUYER side: role buyer, my unread = buyerUnreadCount, counterpart = seller, system flag true', async () => {
      const { lot, conversation } = seedThread({ buyerId, sellerId, buyerUnreadCount: 3 });

      const page = await service.findMine(buyerId, new ConversationListQueryDto());

      expect(page.total).toBe(1);
      const item = page.items[0];
      expect(item?.id).toBe(conversation.id);
      expect(item?.role).toBe('buyer');
      expect(item?.myUnreadCount).toBe(3);
      expect(item?.status).toBe(ConversationStatus.ACTIVE);
      expect(item?.lastMessagePreview).toBe('گفتگو درباره: عمده پیراهن مردانه — ۲٬۲۵۰٬۰۰۰ تومان');
      expect(item?.isLastMessageSystem).toBe(true); // welcome message is the newest
      expect(item?.counterpart).toEqual({
        id: sellerId,
        name: 'فروشنده',
        avatarUrl: null, // TRS/MEDIA placeholder
        verified: false, // TRS-001 placeholder
      });
      expect(item?.lot).toEqual({
        code: lot.code,
        title: lot.title,
        coverThumbUrl: null,
        unitPrice: 2_250_000,
        status: LotStatus.ACTIVE,
      });
    });

    it('maps the SELLER side of the SAME thread mirrored: role seller, counterpart = buyer, seller unread', async () => {
      seedThread({ buyerId, sellerId, sellerUnreadCount: 5 });

      const page = await service.findMine(sellerId, new ConversationListQueryDto());

      const item = page.items[0];
      expect(item?.role).toBe('seller');
      expect(item?.myUnreadCount).toBe(5);
      expect(item?.counterpart).toEqual({
        id: buyerId,
        name: 'خریدار',
        avatarUrl: null,
        verified: false,
      });
    });

    it('flips the system flag OFF once the newest message is a user TEXT (preview + latest stay in lockstep)', async () => {
      const lastMessageAt = new Date('2026-09-01T11:00:00.000Z');
      const { conversation } = seedThread({ buyerId, sellerId, lastMessageAt });
      fake.seedMessage({
        conversationId: conversation.id,
        senderId: buyerId,
        type: MessageType.TEXT,
        body: 'قیمت برای ۵ ستون چقدر می‌شود؟',
        createdAt: new Date(lastMessageAt.getTime() + 3_600_000), // one hour AFTER the welcome
      });
      // Note: the stored lastMessagePreview is only moved by the write path
      // (CHT-003's send transaction); the flag itself derives from the latest
      // MESSAGE row, which is what this thread now has as a TEXT.

      const page = await service.findMine(buyerId, new ConversationListQueryDto());
      expect(page.items[0]?.isLastMessageSystem).toBe(false);
    });

    it('orders by lastMessageAt desc across both roles and resolves the cover thumb', async () => {
      const otherSellerId = fake.seedUser({
        phone: '09124440000',
        name: 'فروشنده دیگر',
        accountRoles: [AccountRole.SELLER],
      }).id;
      const older = seedThread({
        buyerId,
        sellerId,
        lastMessageAt: new Date('2026-09-01T09:00:00.000Z'),
      });
      const newer = seedThread({
        buyerId,
        sellerId: otherSellerId,
        lastMessageAt: new Date('2026-09-01T12:00:00.000Z'),
      });
      const asset = fake.seedMediaAsset({
        ownerId: otherSellerId,
        type: MediaType.IMAGE,
        mime: 'image/jpeg',
        sizeBytes: 10,
        storageKey: '2026/09/original.jpg',
        thumbKey: '2026/09/thumb.webp',
      });
      fake.seedLotMedia({
        lotId: newer.lot.id,
        mediaAssetId: asset.id,
        sortOrder: 0,
        isCover: true,
      });

      const page = await service.findMine(buyerId, new ConversationListQueryDto());

      expect(page.items.map((item) => item.id)).toEqual([
        newer.conversation.id,
        older.conversation.id,
      ]);
      expect(page.items[0]?.lot.coverThumbUrl).toBe(`${MEDIA_BASE_URL}/2026/09/thumb.webp`);
    });

    it('exposes EXACTLY the contracted list-item keys (no raw participant ids, no counterpart unread)', async () => {
      seedThread({ buyerId, sellerId, buyerUnreadCount: 1, sellerUnreadCount: 2 });

      const page = await service.findMine(buyerId, new ConversationListQueryDto());
      const item = page.items[0];

      expect(Object.keys(item ?? {}).sort()).toEqual(
        [
          'counterpart',
          'id',
          'isLastMessageSystem',
          'lastMessageAt',
          'lastMessagePreview',
          'lot',
          'myUnreadCount',
          'role',
          'status',
        ].sort(),
      );
      expect(Object.keys(item?.lot ?? {}).sort()).toEqual(
        ['code', 'coverThumbUrl', 'status', 'title', 'unitPrice'].sort(),
      );
      expect(Object.keys(item?.counterpart ?? {}).sort()).toEqual(
        ['avatarUrl', 'id', 'name', 'verified'].sort(),
      );
    });
  });

  describe('response allowlist (toConversationResponse)', () => {
    it('exposes EXACTLY the contracted keys — no unread counters, no preview, no gallery', async () => {
      const lot = seedActiveLot();
      const asset = fake.seedMediaAsset({
        ownerId: sellerId,
        type: MediaType.IMAGE,
        mime: 'image/jpeg',
        sizeBytes: 10,
      });
      fake.seedLotMedia({ lotId: lot.id, mediaAssetId: asset.id, sortOrder: 0, isCover: true });

      const response = await service.getOrCreate(buyerId, { lotId: lot.id });

      expect(Object.keys(response).sort()).toEqual(
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
      expect(Object.keys(response.lot).sort()).toEqual(
        ['code', 'coverThumbUrl', 'status', 'title', 'unitPrice'].sort(),
      );
    });

    it('lets a dual-hat seller buy elsewhere: seller-with-BUYER-hat opens threads on other sellers lots', async () => {
      const otherSellerId = fake.seedUser({
        phone: '09124440000',
        name: 'فروشنده دیگر',
        accountRoles: [AccountRole.SELLER],
      }).id;
      await fake.user.update({
        where: { id: sellerId },
        data: { accountRoles: [AccountRole.SELLER, AccountRole.BUYER] },
      });
      const lot = seedActiveLot(otherSellerId);

      const response = await service.getOrCreate(sellerId, { lotId: lot.id });
      expect(response.buyerId).toBe(sellerId);
      expect(response.sellerId).toBe(otherSellerId);
    });
  });
});
