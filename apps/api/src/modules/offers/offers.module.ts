import { Module } from '@nestjs/common';
import { LotsModule } from '../lots/lots.module';
import { OffersRepository } from './offers.repository';
import { OffersService } from './offers.service';

/**
 * Offer domain module (OFR-001): the Offer model, the table-driven transition
 * rules (offers.constants.ts) and the domain service (counter chains, sibling
 * invalidation). Deliberately NO controller yet — the offer API
 * (POST /offers, /counter|accept|reject|cancel, role-gated lists) is OFR-002;
 * the expiry sweep is OFR-003; the UI is OFR-004.
 *
 * Pulls in LotsModule for LotsRepository (createCounter re-reads the lot so a
 * child offer always satisfies the CURRENT lot rules). Exports service +
 * repository for OFR-002's controller/service layer.
 */
@Module({
  imports: [LotsModule],
  providers: [OffersService, OffersRepository],
  exports: [OffersService, OffersRepository],
})
export class OffersModule {}
