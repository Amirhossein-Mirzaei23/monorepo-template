import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module';
import { LotsModule } from '../lots/lots.module';
import { OffersModule } from '../offers/offers.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { UsersModule } from '../users/users.module';
import { DealsController } from './deals.controller';
import { DealsRepository } from './deals.repository';
import { DealsService } from './deals.service';

/**
 * Deal domain module (DEAL-001 domain + DEAL-002 creation API + DEAL-003
 * transitions + DEAL-005 completion effects): the Deal + DealEvent models,
 * the table-driven transition matrix with role permissions
 * (deals.constants.ts), the matrix-executor + create-transaction service
 * under DealsController (/deals) — the dispute endpoints are DEAL-007 (P1).
 *
 * Pulls in LotsModule for LotsRepository (the DEAL-002 reserveQuantity /
 * restoreQuantity pair + DEAL-005's markSoldIfDepleted), OffersModule for
 * OffersRepository (the offer-path source row; acceptance created the
 * eligibility), ConversationsModule for ConversationsRepository (the ACTION
 * message + thread lockstep written with OUR tx client — atomicity; the same
 * composition rule as OFR-002), UsersModule for the requester/hat checks and
 * ProfilesModule for ProfilesRepository (DEAL-005's seller successfulDeals
 * increment, inside the completion transaction). Exports service +
 * repository for DEAL-005's effects consumers and DEAL-007 (P1).
 */
@Module({
  imports: [LotsModule, OffersModule, ConversationsModule, UsersModule, ProfilesModule],
  controllers: [DealsController],
  providers: [DealsService, DealsRepository],
  exports: [DealsService, DealsRepository],
})
export class DealsModule {}
