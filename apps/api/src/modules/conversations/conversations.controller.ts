import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import type { Paginated } from '../../common/dto/pagination-query.dto';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { ConversationResponseDto } from './dto/conversation-response.dto';
import { ConversationListItemDto, ConversationListQueryDto } from './dto/conversation-list.dto';
import { ConversationsService } from './conversations.service';

/**
 * Conversation endpoints (CHT-001 get-or-create + CHT-002 inbox listing).
 * Everything here is authenticated (@ApiBearerAuth; the global JwtAuthGuard
 * enforces it) — there is no public chat surface. The BUYER hat, lot
 * existence/ACTIVE state and the self-conversation rule are business rules
 * asserted in ConversationsService (403 BUYER_REQUIRED / 404 / 403
 * SELF_CONVERSATION / 409 INACTIVE_LOT, in that order); the listing needs no
 * hat — participant scope only (buyerId = me OR sellerId = me).
 *
 * Status code decision (documented on the card): POST /conversations is
 * get-or-create and ALWAYS answers 200 with the conversation — from the
 * client's perspective it is "give me the thread for this lot", so there is
 * no 201-on-first-call split and the create-twice acceptance is "same id,
 * 200 both times".
 */
@ApiTags('conversations')
@ApiBearerAuth('access-token')
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  /**
   * CHT-002 — the inbox. Fixed order (lastMessageAt desc) — the query DTO
   * caps limit at 50 and deliberately does not honour `sort`.
   */
  @Get()
  @ApiOkResponse({
    description:
      'Paginated<ConversationListItemDto>: { items, total, page, limit } — newest activity (lastMessageAt desc) first; each item carries the lot context, the counterpart (avatar/verified placeholders), the ≤ 80-char preview with its system flag and MY unread count + role',
  })
  @ApiOperation({
    summary:
      "List the authenticated participant's conversations (buyer OR seller side) — newest activity first, page size capped at 50",
  })
  async list(
    @CurrentUser() user: AuthUser,
    @Query() query: ConversationListQueryDto,
  ): Promise<Paginated<ConversationListItemDto>> {
    return this.conversations.findMine(user.sub, query);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: ConversationResponseDto,
    description:
      "The buyer's thread for this lot — created (with a SYSTEM welcome message) or returned unchanged; 200 either way",
  })
  @ApiOperation({
    summary:
      "Get-or-create the authenticated buyer's conversation about a lot (403 self/non-buyer, 404 unknown lot, 409 inactive lot)",
  })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateConversationDto,
  ): Promise<ConversationResponseDto> {
    return this.conversations.getOrCreate(user.sub, dto);
  }
}
