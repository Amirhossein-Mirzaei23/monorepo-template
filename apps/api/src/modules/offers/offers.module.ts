import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module';
import { LotsModule } from '../lots/lots.module';
import { UsersModule } from '../users/users.module';
import { LotOffersController } from './lot-offers.controller';
import { OffersRepository } from './offers.repository';
import { OffersController } from './offers.controller';
import { OffersService } from './offers.service';

/**
 * Offer domain module (OFR-001 domain + OFR-002 API): the Offer model, the
 * table-driven transition rules (offers.constants.ts) and the service
 * (counter chains, sibling invalidation, the role-gated endpoint rules) under
 * OffersController (/offers) and LotOffersController (/lots/:lotId/offers).
 * The expiry sweep is OFR-003; the UI is OFR-004.
 *
 * Pulls in LotsModule for LotsRepository (createCounter re-reads the lot so a
 * child offer always satisfies the CURRENT lot rules), UsersModule for the
 * requester/hat checks and ConversationsModule for ConversationsRepository —
 * the offer transactions write their ACTION messages + the conversation
 * lockstep THROUGH the conversations repository with the SAME tx client
 * (atomicity; ConversationsService.sendMessage opens its own transaction and
 * cannot be composed into the offer's). Exports service + repository for
 * DEAL-002 (offer validation on deal creation).
 */
@Module({
  imports: [LotsModule, UsersModule, ConversationsModule],
  controllers: [OffersController, LotOffersController],
  providers: [OffersService, OffersRepository],
  exports: [OffersService, OffersRepository],
})
export class OffersModule {}
