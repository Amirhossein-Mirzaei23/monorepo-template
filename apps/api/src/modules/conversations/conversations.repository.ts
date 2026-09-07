import { Injectable } from '@nestjs/common';
import { Prisma, type Conversation, type Message } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

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
}

/** Re-exported for specs that only need the scalar row type. */
export type { Conversation, Message };
