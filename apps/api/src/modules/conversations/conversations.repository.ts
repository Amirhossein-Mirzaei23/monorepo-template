import { Injectable } from '@nestjs/common';
import { Prisma, type Conversation, type Message } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { Paginated } from '../../common/dto/pagination-query.dto';

type Tx = Prisma.TransactionClient | undefined;

/**
 * The lot join every conversation response needs (CHT-001): the LOT context
 * block plus the single cover link with its asset keys — the same arm the
 * MKT-001 card include uses, so the thumb resolution (thumbKey → storageKey
 * fallback) stays identical across modules. Cover-only: nothing else from the
 * gallery belongs in a conversation payload.
 */
export const CONVERSATION_LOT_INCLUDE = {
  lot: {
    include: {
      media: {
        where: { isCover: true },
        take: 1,
        include: { mediaAsset: { select: { thumbKey: true, storageKey: true } } },
      },
    },
  },
} satisfies Prisma.ConversationInclude;

/** The get-or-create read/create row shape (Conversation + lot + cover link). */
export type ConversationWithLot = Prisma.ConversationGetPayload<{
  include: typeof CONVERSATION_LOT_INCLUDE;
}>;

/**
 * The inbox page join (CHT-002): the CHT-001 lot arm PLUS both participant
 * summaries ({id, name} — the mapper resolves the counterpart against the
 * viewer) PLUS the latest message (type only — the isLastMessageSystem flag's
 * source). SYSTEM-flag decision (documented on the card): the flag is derived
 * from the latest-message RELATION instead of a stored lastMessageType column
 * — no migration, and CHT-003's send transaction keeps
 * lastMessageAt/lastMessagePreview and the newest message row in lockstep, so
 * the derived flag can never disagree with the stored preview.
 */
export const CONVERSATION_LIST_INCLUDE = {
  ...CONVERSATION_LOT_INCLUDE,
  buyer: { select: { id: true, name: true } },
  seller: { select: { id: true, name: true } },
  messages: { orderBy: { createdAt: 'desc' as const }, take: 1, select: { type: true } },
} satisfies Prisma.ConversationInclude;

/** The inbox page row shape (Conversation + lot/cover + participants + latest message). */
export type ConversationListRepositoryRow = Prisma.ConversationGetPayload<{
  include: typeof CONVERSATION_LIST_INCLUDE;
}>;

/**
 * Data access only. Every method accepts an optional transaction client so the
 * repository stays unit-of-work agnostic — services own transaction boundaries
 * (doc/CONVENTIONS.md → Transactions). Repositories never call $transaction.
 */
@Injectable()
export class ConversationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx: Tx): Prisma.TransactionClient | PrismaService {
    return tx ?? this.prisma;
  }

  /**
   * The get-or-create lookup, keyed on the DB's unique(lotId, buyerId).
   * Returns the row WITH the lot join so the found branch maps to the
   * response DTO without a second read.
   */
  async findByLotAndBuyer(
    lotId: string,
    buyerId: string,
    tx: Tx = undefined,
  ): Promise<ConversationWithLot | null> {
    return this.client(tx).conversation.findUnique({
      where: { lotId_buyerId: { lotId, buyerId } },
      include: CONVERSATION_LOT_INCLUDE,
    });
  }

  async create(
    data: Prisma.ConversationUncheckedCreateInput,
    tx: Tx = undefined,
  ): Promise<ConversationWithLot> {
    return this.client(tx).conversation.create({ data, include: CONVERSATION_LOT_INCLUDE });
  }

  /** Insert one message (the SYSTEM welcome on CHT-001; sends land CHT-003). */
  async createMessage(
    data: Prisma.MessageUncheckedCreateInput,
    tx: Tx = undefined,
  ): Promise<Message> {
    return this.client(tx).message.create({ data });
  }

  /**
   * The participant inbox page (CHT-002): union scope `buyerId = me OR
   * sellerId = me`, newest-activity first (lastMessageAt desc, id desc as the
   * deterministic tiebreak — lastMessageAt can tie across threads, and pages
   * must never duplicate/skip rows). ONE findMany + ONE count (2-query-max per
   * page); every relation (lot/cover, participants, latest message) rides the
   * same findMany as batched includes — no N+1. The (buyerId, lastMessageAt) /
   * (sellerId, lastMessageAt) indexes from CHT-001 cover both scan arms.
   */
  async findForUser(
    userId: string,
    { page, limit }: { page: number; limit: number },
    tx: Tx = undefined,
  ): Promise<Paginated<ConversationListRepositoryRow>> {
    const where: Prisma.ConversationWhereInput = {
      OR: [{ buyerId: userId }, { sellerId: userId }],
    };
    const client = this.client(tx);
    const [items, total] = await Promise.all([
      client.conversation.findMany({
        where,
        orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
        include: CONVERSATION_LIST_INCLUDE,
        skip: (page - 1) * limit,
        take: limit,
      }),
      client.conversation.count({ where }),
    ]);
    return { items, total, page, limit };
  }
}

/** Re-exported for specs that only need the scalar row type. */
export type { Conversation, Message };
