import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OffersRepository } from '../offers/offers.repository';

/**
 * OFR-003: hourly expiration sweep. Flips every PENDING offer past
 * `expiresAt` to EXPIRED via one batched, idempotent updateMany
 * (repository-owned query); a failed run only logs the error and the next
 * tick retries it — the where predicate makes every run converge on the same
 * end state. Lazy expiry (OffersService.expireIfDue, OFR-002) guards the
 * actions between ticks; this sweep is the persisted guarantee.
 *
 * The real logic lives in the public expireDueOffers() so tests (and future
 * admin tooling, if a card ever asks) can invoke it without waiting an hour;
 * the @Cron handler is a thin wrapper around it.
 */
@Injectable()
export class OfferExpiryService {
  private readonly logger = new Logger(OfferExpiryService.name);

  constructor(private readonly offersRepository: OffersRepository) {}

  /** Every hour, on the hour (server TZ — sweep cadence, not a business rule). */
  @Cron(CronExpression.EVERY_HOUR)
  async handleExpiryCron(): Promise<number> {
    return this.expireDueOffers();
  }

  async expireDueOffers(): Promise<number> {
    try {
      const expiredCount = await this.offersRepository.expireDue();
      if (expiredCount > 0) {
        // Counts only — no offer payloads/buyer data in logs.
        this.logger.log(`Offer expiry sweep: ${expiredCount} offer(s) expired`);
      }
      // TODO(NTF-001, P1): notify each expired offer's buyer («پیشنهاد شما
      // منقضی شد») — needs the pre-update ids, so the sweep will move to a
      // transactional read-then-update there; hook point intentionally left
      // to the notification card.
      return expiredCount;
    } catch (error) {
      // Card "Error states": job errors logged, retried next hour — never
      // rethrown, an unhandled rejection here would crash the process.
      this.logger.error(
        `Offer expiry sweep failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 0;
    }
  }
}
