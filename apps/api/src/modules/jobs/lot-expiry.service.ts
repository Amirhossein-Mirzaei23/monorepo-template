import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LotsRepository } from '../lots/lots.repository';

/**
 * LOT-006: hourly expiration sweep. Flips every ACTIVE lot past `expiresAt`
 * to EXPIRED via one batched, idempotent updateMany (repository-owned query);
 * a failed run only logs the error and the next tick retries it — the where
 * predicate makes every run converge on the same end state.
 *
 * The real logic lives in the public expireDueLots() so tests (and future
 * admin tooling, if a card ever asks) can invoke it without waiting an hour;
 * the @Cron handler is a thin wrapper around it.
 */
@Injectable()
export class LotExpiryService {
  private readonly logger = new Logger(LotExpiryService.name);

  constructor(private readonly lotsRepository: LotsRepository) {}

  /** Every hour, on the hour (server TZ — sweep cadence, not a business rule). */
  @Cron(CronExpression.EVERY_HOUR)
  async handleExpiryCron(): Promise<number> {
    return this.expireDueLots();
  }

  async expireDueLots(): Promise<number> {
    try {
      const expiredCount = await this.lotsRepository.expireDue();
      if (expiredCount > 0) {
        // Counts only — no lot payloads/seller data in logs.
        this.logger.log(`Lot expiry sweep: ${expiredCount} lot(s) expired`);
      }
      // TODO(NTF-001, P1): notify each expired lot's seller («لات شما منقضی
      // شد») — needs the pre-update ids, so the sweep will move to a
      // transactional read-then-update there; hook point intentionally left
      // to the notification card.
      return expiredCount;
    } catch (error) {
      // Card "Error states": job errors logged, retried next hour — never
      // rethrown, an unhandled rejection here would crash the process.
      this.logger.error(
        `Lot expiry sweep failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 0;
    }
  }
}
