import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountRole, LotStatus, MessageType, type User } from '@prisma/client';
import { requireAppConfig } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import { LotsRepository } from '../lots/lots.repository';
import { UsersRepository } from '../users/users.repository';
import {
  CONVERSATION_ERROR_CODES,
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
import type { Paginated } from '../../common/dto/pagination-query.dto';
import { ConversationsRepository } from './conversations.repository';
import type { CreateConversationDto } from './dto/create-conversation.dto';

/** Prisma unique-violation probe (works on real client errors and plain fakes). */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}

/**
 * Conversation business rules (CHT-001) — the get-or-create behind
 * POST /conversations. Precondition order mirrors the lots module's owner
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

  private toResponse(row: ConversationRepositoryRow): ConversationResponseDto {
    return toConversationResponse(row, requireAppConfig(this.config).storage.publicMediaBaseUrl);
  }
}
