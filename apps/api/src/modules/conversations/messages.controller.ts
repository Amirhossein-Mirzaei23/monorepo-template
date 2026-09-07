import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { type AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { MESSAGE_SEND_THROTTLE } from './conversations.constants';
import { ConversationsService } from './conversations.service';
import {
  MarkConversationReadResponseDto,
  MessagePageDto,
  MessageListQueryDto,
  MessageResponseDto,
  SendMessageDto,
} from './dto/message.dto';

/**
 * Message endpoints under the conversations module (CHT-003) — send, history,
 * read. Everything here is authenticated (@ApiBearerAuth; the global
 * JwtAuthGuard enforces it). The precondition chain lives in
 * ConversationsService and is uniform across all three: 401 anonymous, 404
 * unknown conversation, 403 known-but-foreign (NOT_PARTICIPANT — the card's
 * literal 403-for-non-participant; existence leaks by id are accepted because
 * ids are unguessable cuids) and, sends only, 403 CONVERSATION_BLOCKED.
 *
 * Status decisions (documented on the card):
 * - POST /:id/messages answers 201 Created — a new message row, unlike the
 *   get-or-create POST /conversations whose "give me the thread" semantics
 *   pin it to 200.
 * - GET /:id/messages is deliberately NOT Paginated — chat history loads
 *   backwards with a `before` message-id cursor ({items ASC, hasMore,
 *   nextCursor}), so there is no page/total envelope.
 * - POST /:id/read answers { readCount } — the number of counterpart
 *   messages this call stamped readAt = now.
 *
 * CHT-007: the send accepts TEXT (body 1..2000) or media references
 * {type: IMAGE|VIDEO, mediaAssetId} with an EMPTY body; the service validates
 * asset ownership (403 MEDIA_NOT_OWNED) and type match (400). Media rows
 * answer with their storage/preview keys — clients stream them through the
 * BEARER route GET /media/secure/{key} (the secure route enforces
 * participation for message-referenced assets), never through the public one.
 */
@ApiTags('conversations')
@ApiBearerAuth('access-token')
@Controller('conversations')
export class MessagesController {
  constructor(private readonly conversations: ConversationsService) {}

  @Post(':id/messages')
  @Throttle({
    default: { limit: MESSAGE_SEND_THROTTLE.limit, ttl: MESSAGE_SEND_THROTTLE.ttlMs },
  })
  @ApiCreatedResponse({
    type: MessageResponseDto,
    description:
      'The created message (readAt null) — TEXT or IMAGE/VIDEO with its media keys; the conversation lockstep (lastMessageAt/preview + counterpart unread increment) committed in the same transaction',
  })
  @ApiOperation({
    summary:
      'Send a TEXT or IMAGE/VIDEO message to a thread I participate in (403 non-participant/blocked/foreign-asset, 404 unknown, 400 validation/type mismatch, 429 over 30/min)',
  })
  async send(
    @CurrentUser() user: AuthUser,
    @Param('id') conversationId: string,
    @Body() dto: SendMessageDto,
  ): Promise<MessageResponseDto> {
    return this.conversations.sendMessage(user.sub, conversationId, dto);
  }

  @Get(':id/messages')
  @ApiOkResponse({
    type: MessagePageDto,
    description:
      'NOT Paginated — backwards cursor history: { items ASC ending at the cursor, hasMore (older exist?), nextCursor (oldest returned id, null when exhausted) }',
  })
  @ApiOperation({
    summary:
      'Walk a thread history backwards: ?before=<messageId>&limit≤50 (default 30) — ASC page of strictly older messages',
  })
  async list(
    @CurrentUser() user: AuthUser,
    @Param('id') conversationId: string,
    @Query() query: MessageListQueryDto,
  ): Promise<MessagePageDto> {
    return this.conversations.listMessages(user.sub, conversationId, query);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: MarkConversationReadResponseDto,
    description:
      '{ readCount } — my unread counter zeroed + that many counterpart messages stamped readAt = now (0 on an idempotent re-read)',
  })
  @ApiOperation({
    summary:
      'Mark my side of the thread read: zero my unread counter and batch-stamp the counterpart unread messages',
  })
  async markRead(
    @CurrentUser() user: AuthUser,
    @Param('id') conversationId: string,
  ): Promise<MarkConversationReadResponseDto> {
    return this.conversations.markRead(user.sub, conversationId);
  }
}
