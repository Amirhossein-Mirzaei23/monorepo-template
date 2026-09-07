import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { ConversationResponseDto } from './dto/conversation-response.dto';
import { ConversationsService } from './conversations.service';

/**
 * Conversation endpoints (CHT-001). Everything here is authenticated
 * (@ApiBearerAuth; the global JwtAuthGuard enforces it) — there is no public
 * chat surface. The BUYER hat, lot existence/ACTIVE state and the
 * self-conversation rule are business rules asserted in ConversationsService
 * (403 BUYER_REQUIRED / 404 / 403 SELF_CONVERSATION / 409 INACTIVE_LOT, in
 * that order).
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
