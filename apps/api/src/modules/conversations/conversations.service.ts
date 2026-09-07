import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccountRole,
  ConversationStatus,
  LotStatus,
  MessageType,
  type Conversation,
  type User,
} from '@prisma/client';
import { requireAppConfig } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import { LotsRepository } from '../lots/lots.repository';
import { UsersRepository } from '../users/users.repository';
import {
  CONVERSATION_ERROR_CODES,
  MESSAGE_ERROR_CODES,
  truncatePreview,
  welcomeMessageBody,
} from './conversations.constants';
import {
  toConversationResponse,
  type ConversationRepositoryRow,
  type ConversationResponseDto,
} from './dto/conversation-response.dto';
import {
  toConversationListItemDto,
  type ConversationListItemDto,
  type ConversationListQueryDto,
} from './dto/conversation-list.dto';
import {
  MarkConversationReadResponseDto,
  MessagePageDto,
  MessageResponseDto,
  SendMessageDto,
  toMessageResponse,
  type MessageListQueryDto,
} from './dto/message.dto';
import type { Paginated } from '../../common/dto/pagination-query.dto';
import { CHAT_EMITTER, type ChatEmitter, type ConversationUpdatedEvent } from './chat.events';
import { ConversationsRepository } from './conversations.repository';
import type { CreateConversationDto } from './dto/create-conversation.dto';

/** Prisma unique-violation probe (works on real client errors and plain fakes). */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}

/**
 * Conversation business rules — CHT-001's get-or-create behind
 * POST /conversations plus CHT-003's messages send/list/read under the same
 * module. Precondition order mirrors the lots module's owner
 * chain (hats before probing):
 *
 * 1. authenticated (401 by the global guard) + user row still exists (401)
 * 2. BUYER hat (403 BUYER_REQUIRED)
 * 3. lot exists (404 — uniform, no oracle for why)
 * 4. requester is NOT the lot's seller (403 SELF_CONVERSATION)
 * 5. lot is ACTIVE (409 INACTIVE_LOT — «این لات فعال نیست» renders web-side)
 *
 * Get-or-create: unique(lotId, buyerId) is the one-thread-per-buyer-per-lot
 * rule. Found → return it unchanged (200). Missing → one transaction writes
 * the conversation row AND the SYSTEM welcome message («گفتگو درباره: …»),
 * seeding lastMessageAt + lastMessagePreview. A concurrent duplicate loses
 * the P2002 race and re-reads the winner — the endpoint is idempotent either
 * way and always answers 200 with the SAME conversation (documented status
 * decision: get-or-create is a read-from-the-client's-perspective, so no
 * 201-on-first-call split).
 */
@Injectable()
export class ConversationsService {
  constructor(
    private readonly repository: ConversationsRepository,
    private readonly users: UsersRepository,
    private readonly lots: LotsRepository,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    /**
     * CHT-004 — the outbound realtime seam, injected as the ChatEmitter
     * INTERFACE (CHAT_EMITTER token; ConversationsModule binds it to the
     * ChatGateway with `useExisting`). The service only announces COMMITTED
     * mutations and never touches socket.io, so unit tests run against a
     * recording fake.
     */
    @Inject(CHAT_EMITTER) private readonly emitter: ChatEmitter,
  ) {}

  async getOrCreate(buyerId: string, dto: CreateConversationDto): Promise<ConversationResponseDto> {
    const user = await this.requireUser(buyerId);
    this.assertBuyer(user);

    const lot = await this.lots.findById(dto.lotId);
    if (!lot) {
      throw new NotFoundException('Lot not found');
    }
    if (lot.sellerId === buyerId) {
      throw new ForbiddenException({
        code: CONVERSATION_ERROR_CODES.SELF_CONVERSATION,
        message: 'You cannot start a conversation on your own lot',
      });
    }
    if (lot.status !== LotStatus.ACTIVE) {
      throw new ConflictException({
        code: CONVERSATION_ERROR_CODES.INACTIVE_LOT,
        message: 'This lot is not active',
      });
    }

    const existing = await this.repository.findByLotAndBuyer(lot.id, buyerId);
    if (existing) {
      return this.toResponse(existing);
    }

    const body = welcomeMessageBody(lot.title, lot.unitPrice);
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const conversation = await this.repository.create(
          {
            lotId: lot.id,
            buyerId,
            sellerId: lot.sellerId,
            lastMessageAt: new Date(),
            lastMessagePreview: truncatePreview(body),
          },
          tx,
        );
        await this.repository.createMessage(
          {
            conversationId: conversation.id,
            senderId: null, // SYSTEM rows have no sender (plan §3: sender null = system)
            type: MessageType.SYSTEM,
            body,
          },
          tx,
        );
        return conversation;
      });
      return this.toResponse(created);
    } catch (error) {
      // Concurrent get-or-create for the same (lot, buyer): the unique constraint
      // picked a winner — return the SAME conversation instead of failing.
      if (isUniqueViolation(error)) {
        const raced = await this.repository.findByLotAndBuyer(lot.id, buyerId);
        if (raced) {
          return this.toResponse(raced);
        }
      }
      throw error;
    }
  }

  // --- CHT-003 — messages: send / history / read ---

  /**
   * The send transaction (POST /conversations/:id/messages). Precondition
   * order follows the module chain — identity before probing, then the card's
   * "404 unknown conversation first, 403 non-participant":
   *
   * 1. authenticated (401 by the global guard) + user row still exists (401)
   * 2. conversation exists (404 — unknown ids answer uniformly)
   * 3. requester is buyer OR seller (403 NOT_PARTICIPANT). The card pins 403
   *    (not 404) for known-but-foreign conversations, which leaks existence
   *    by id — accepted deliberately: ids are unguessable cuids, never
   *    sequential, so there is nothing to enumerate.
   * 4. conversation not BLOCKED (403 CONVERSATION_BLOCKED — no side can send;
   *    CHT-009 introduces the endpoint that sets the status, the gate is
   *    honored here already)
   *
   * The transaction writes BOTH halves atomically: the TEXT message row
   * (sender = me) AND the conversation lockstep (lastMessageAt = now,
   * lastMessagePreview = truncate(body, 80) — the invariant CHT-002's derived
   * system flag relies on) + the COUNTERPART unread counter via one atomic
   * { increment } (buyer sends → sellerUnreadCount+1, seller sends →
   * buyerUnreadCount+1; my own counter never moves on my own send).
   *
   * Returns the created row as MessageResponseDto. CHT-004: AFTER the
   * transaction commits, the realtime announcements go through the injected
   * emitter — `message:new` to the conversation room and
   * `conversation:updated` to the OTHER participant's user room (carrying the
   * recipient's post-increment unread counter). Emitting post-commit means
   * listeners only ever see committed data; a lost delivery is recovered by
   * the web's polling fallback.
   */
  async sendMessage(
    userId: string,
    conversationId: string,
    dto: SendMessageDto,
  ): Promise<MessageResponseDto> {
    await this.requireUser(userId);
    const conversation = await this.repository.findById(conversationId);
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    this.assertParticipant(conversation, userId);
    this.assertNotBlocked(conversation);

    const body = dto.body; // trimmed by the DTO transform — the service trusts the boundary
    const sentAt = new Date();
    const { message, updated } = await this.prisma.$transaction(async (tx) => {
      const message = await this.repository.createMessage(
        {
          conversationId: conversation.id,
          senderId: userId,
          type: dto.type,
          body,
        },
        tx,
      );
      // Re-read through the update's return: the post-increment counters feed
      // the conversation:updated payload (the recipient's new unread count).
      const updated = await this.repository.updateConversation(
        conversation.id,
        {
          lastMessageAt: sentAt,
          lastMessagePreview: truncatePreview(body),
          ...(conversation.buyerId === userId
            ? { sellerUnreadCount: { increment: 1 } }
            : { buyerUnreadCount: { increment: 1 } }),
        },
        tx,
      );
      return { message, updated };
    });

    const response = toMessageResponse(message);
    this.emitter.emitMessageNew({ conversationId: conversation.id, message: response });
    const [recipientId, updatedEvent] = this.conversationUpdatedArgs(userId, updated);
    this.emitter.emitConversationUpdated(recipientId, updatedEvent);
    return response;
  }

  /**
   * Builds the `conversation:updated` recipient + payload for a committed
   * send: the OTHER side of the thread (never the sender), the activity stamp
   * written by the transaction, the stored preview, and their unread counter
   * AFTER the atomic increment (mirrors the send's increment arm).
   */
  private conversationUpdatedArgs(
    senderId: string,
    updated: Conversation,
  ): [string, ConversationUpdatedEvent] {
    const senderIsBuyer = updated.buyerId === senderId;
    const recipientId = senderIsBuyer ? updated.sellerId : updated.buyerId;
    return [
      recipientId,
      {
        conversationId: updated.id,
        lastMessageAt: updated.lastMessageAt,
        preview: updated.lastMessagePreview,
        unreadCount: senderIsBuyer ? updated.sellerUnreadCount : updated.buyerUnreadCount,
      },
    ];
  }

  /**
   * The thread history (GET /conversations/:id/messages) — cursor pagination
   * walking BACKWARDS (chat history loads oldest-at-top; the card mandates
   * this shape over the Paginated envelope: a growing thread has no stable
   * total). One read per page: findMessagesBefore fetches limit + 1 rows
   * strictly older than the cursor (newest-first + id tiebreak), the extra
   * row answers hasMore without a count query, then the service reverses to
   * ASC. `before` must be a message OF THIS conversation — anything else is a
   * client bug (400 INVALID_CURSOR), not a probeable resource. No BLOCKED
   * gate: a blocked thread stays READABLE (CHT-009 renders its banner over
   * history) — only sends are rejected. SYSTEM rows are visible.
   */
  async listMessages(
    userId: string,
    conversationId: string,
    query: MessageListQueryDto,
  ): Promise<MessagePageDto> {
    await this.requireUser(userId);
    const conversation = await this.repository.findById(conversationId);
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    this.assertParticipant(conversation, userId);

    const cursorMessage = query.before ? await this.repository.findMessageById(query.before) : null;
    if (query.before !== undefined && cursorMessage?.conversationId !== conversationId) {
      throw new BadRequestException({
        code: MESSAGE_ERROR_CODES.INVALID_CURSOR,
        message: 'The before cursor is not a message of this conversation',
      });
    }

    const rows = await this.repository.findMessagesBefore(
      conversation.id,
      cursorMessage?.createdAt ?? null,
      query.limit + 1,
    );
    const hasMore = rows.length > query.limit;
    const items = (hasMore ? rows.slice(0, query.limit) : rows)
      .slice()
      .reverse()
      .map(toMessageResponse);
    return {
      items,
      hasMore,
      // The next (older) page's cursor: the OLDEST id of THIS page; null once
      // history is exhausted so the client stops walking.
      nextCursor: hasMore ? (items[0]?.id ?? null) : null,
    };
  }

  /**
   * Mark my side read (POST /conversations/:id/read). One transaction with
   * BOTH halves of the read state: my unread counter zeroes (buyer →
   * buyerUnreadCount, seller → sellerUnreadCount) and ONE batch updateMany
   * stamps readAt = now over the COUNTERPART's still-unread messages (my own
   * rows are read by definition; SYSTEM rows — sender null — are purely
   * informational and never carry read state). Answers the simple
   * { readCount } shape (documented decision on the card): how many rows this
   * call actually stamped — 0 on an idempotent re-read.
   *
   * CHT-004: post-commit, a `message:read` receipt goes to the conversation
   * room through the emitter (the sender's ticks flip live). Always emitted —
   * even for readCount 0 — so the counterpart learns the reader is caught up.
   */
  async markRead(userId: string, conversationId: string): Promise<MarkConversationReadResponseDto> {
    await this.requireUser(userId);
    const conversation = await this.repository.findById(conversationId);
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    this.assertParticipant(conversation, userId);

    const iAmBuyer = conversation.buyerId === userId;
    const counterpartId = iAmBuyer ? conversation.sellerId : conversation.buyerId;
    const readAt = new Date();
    const { count } = await this.prisma.$transaction(async (tx) => {
      await this.repository.updateConversation(
        conversation.id,
        iAmBuyer ? { buyerUnreadCount: 0 } : { sellerUnreadCount: 0 },
        tx,
      );
      return this.repository.updateManyMessages(
        { conversationId: conversation.id, senderId: counterpartId, readAt: null },
        { readAt },
        tx,
      );
    });
    this.emitter.emitMessageRead({
      conversationId: conversation.id,
      readerId: userId,
      readCount: count,
    });
    return { readCount: count };
  }

  // --- precondition helpers (order documented in the class doc) ---

  /**
   * The participant inbox (GET /conversations, CHT-002): every thread where
   * buyerId = me OR sellerId = me — both hats share the one endpoint, no role
   * gate (unlike getOrCreate's BUYER requirement: reading your own inbox is
   * not an action on someone else's lot). One existence check (401 when the
   * token user is gone — same rule as getOrCreate), then the repository's
   * 2-query page read; each row maps through the strict allowlist with
   * role/counterpart/myUnreadCount resolved against the CALLER, so the two
   * sides of the same thread see mirrored payloads.
   */
  async findMine(
    userId: string,
    query: ConversationListQueryDto,
  ): Promise<Paginated<ConversationListItemDto>> {
    await this.requireUser(userId);
    const { items, total, page, limit } = await this.repository.findForUser(userId, {
      page: query.page,
      limit: query.limit,
    });
    const mediaBaseUrl = requireAppConfig(this.config).storage.publicMediaBaseUrl;
    return {
      items: items.map((row) => toConversationListItemDto(row, userId, mediaBaseUrl)),
      total,
      page,
      limit,
    };
  }

  private async requireUser(userId: string): Promise<User> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }
    return user;
  }

  /** Authenticated AND holding the BUYER hat — else 403 + BUYER_REQUIRED code. */
  private assertBuyer(user: User): void {
    if (!user.accountRoles.includes(AccountRole.BUYER)) {
      throw new ForbiddenException({
        code: CONVERSATION_ERROR_CODES.BUYER_REQUIRED,
        message: 'Only buyer accounts can start conversations',
      });
    }
  }

  /** Takes either side of the thread — else 403 + NOT_PARTICIPANT (CHT-003). */
  private assertParticipant(conversation: Conversation, userId: string): void {
    if (conversation.buyerId !== userId && conversation.sellerId !== userId) {
      throw new ForbiddenException({
        code: MESSAGE_ERROR_CODES.NOT_PARTICIPANT,
        message: 'You are not a participant of this conversation',
      });
    }
  }

  /** BLOCKED threads reject sends from BOTH sides (403) — list/read stay open. */
  private assertNotBlocked(conversation: Conversation): void {
    if (conversation.status === ConversationStatus.BLOCKED) {
      throw new ForbiddenException({
        code: MESSAGE_ERROR_CODES.CONVERSATION_BLOCKED,
        message: 'This conversation is blocked',
      });
    }
  }

  private toResponse(row: ConversationRepositoryRow): ConversationResponseDto {
    return toConversationResponse(row, requireAppConfig(this.config).storage.publicMediaBaseUrl);
  }
}
