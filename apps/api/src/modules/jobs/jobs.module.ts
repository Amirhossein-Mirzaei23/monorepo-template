import { Module } from '@nestjs/common';
import { LotsModule } from '../lots/lots.module';
import { OffersModule } from '../offers/offers.module';
import { LotExpiryService } from './lot-expiry.service';
import { OfferExpiryService } from './offer-expiry.service';

/**
 * Shared scheduled-jobs module (LOT-006 created it). Each job is a provider
 * here; cron scheduling itself comes from ScheduleModule.forRoot() in
 * app.module.ts. Later jobs (PROF-005 rollup, …) register alongside
 * LotExpiryService and reuse the repository imports below.
 */
@Module({
  imports: [LotsModule, OffersModule],
  providers: [LotExpiryService, OfferExpiryService],
  exports: [LotExpiryService, OfferExpiryService],
})
export class JobsModule {}
