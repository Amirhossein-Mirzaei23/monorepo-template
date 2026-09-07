import { Module } from '@nestjs/common';
import { LotsModule } from '../lots/lots.module';
import { UsersModule } from '../users/users.module';
import { ConversationsController } from './conversations.controller';
import { ConversationsRepository } from './conversations.repository';
import { ConversationsService } from './conversations.service';
import { MessagesController } from './messages.controller';

/**
 * Conversation domain module (CHT-001 get-or-create + CHT-002 inbox under
 * ConversationsController; CHT-003 messages send/list/read under
 * MessagesController — the card's "messages controller under the same
 * module"). Pulls in Users for the requester lookup and Lots for the lot read
 * (existence/status/seller derivation + the cover-join the response's lot
 * summary needs) — reads go through the owning module's repository per the
 * layered-REST rules.
 */
@Module({
  imports: [UsersModule, LotsModule],
  controllers: [ConversationsController, MessagesController],
  providers: [ConversationsService, ConversationsRepository],
  exports: [ConversationsRepository],
})
export class ConversationsModule {}
