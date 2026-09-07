import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LotsModule } from '../lots/lots.module';
import { UsersModule } from '../users/users.module';
import { CHAT_EMITTER } from './chat.events';
import { ChatGateway } from './chat.gateway';
import { ConversationsController } from './conversations.controller';
import { ConversationsRepository } from './conversations.repository';
import { ConversationsService } from './conversations.service';
import { MessagesController } from './messages.controller';

/**
 * Conversation domain module (CHT-001 get-or-create + CHT-002 inbox under
 * ConversationsController; CHT-003 messages send/list/read under
 * MessagesController — the card's "messages controller under the same
 * module"; CHT-004 the /ws socket.io gateway under ChatGateway). Pulls in
 * Users for the requester lookup, Lots for the lot read (existence/status/
 * seller derivation + the cover-join the response's lot summary needs) and —
 * since CHT-004 — AuthModule for the handshake's TokenService (the SAME
 * access-token verification REST uses).
 *
 * CHT-004 wiring: ChatGateway implements the ChatEmitter interface and is
 * bound to the CHAT_EMITTER token with `useExisting`, so ConversationsService
 * depends only on the interface — unit tests inject a recording fake, while
 * production emits reach the real socket.io server. The card's separate
 * `chat.gateway.module.ts` was deliberately folded into THIS module: the
 * gateway needs ConversationsRepository (room-join participant checks) and
 * the service needs CHAT_EMITTER (the gateway) — a second module would force
 * a forwardRef cycle for zero benefit.
 */
@Module({
  imports: [UsersModule, LotsModule, AuthModule],
  controllers: [ConversationsController, MessagesController],
  providers: [
    ConversationsService,
    ConversationsRepository,
    ChatGateway,
    // Service → emitter interface; gateway is the production implementation.
    { provide: CHAT_EMITTER, useExisting: ChatGateway },
  ],
  exports: [ConversationsRepository],
})
export class ConversationsModule {}
