import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module';
import { LotsModule } from '../lots/lots.module';
import { OffersModule } from '../offers/offers.module';
import { UsersModule } from '../users/users.module';
import { DealsController } from './deals.controller';
import { DealsRepository } from './deals.repository';
import { DealsService } from './deals.service';

/**
 * Deal domain module (DEAL-001 domain + DEAL-002 creation API): the Deal +
 * DealEvent models, the table-driven transition matrix with role permissions
 * (deals.constants.ts), the matrix-executor + create-transaction service
 * under DealsController (/deals) — the transition API is DEAL-003, the UI
 * DEAL-004, dispute endpoints DEAL-007 P1.
 *
 * Pulls in LotsModule for LotsRepository (the DEAL-002 reserveQuantity /
 * restoreQuantity pair — reservation + cancel-restore on the lot), OffersModule
 * for OffersRepository (the offer-path source row; acceptance created the
 * eligibility), ConversationsModule for ConversationsRepository (the ACTION
 * message + thread lockstep written with OUR tx client — atomicity; the same
 * composition rule as OFR-002) and UsersModule for the requester/hat checks.
 * Exports service + repository for DEAL-003 (the transition endpoints execute
 * the matrix through DealsService.transition) and DEAL-005 (completion
 * effects).
 */
@Module({
  imports: [LotsModule, OffersModule, ConversationsModule, UsersModule],
  controllers: [DealsController],
  providers: [DealsService, DealsRepository],
  exports: [DealsService, DealsRepository],
})
export class DealsModule {}
