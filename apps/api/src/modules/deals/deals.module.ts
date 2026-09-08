import { Module } from '@nestjs/common';
import { DealsRepository } from './deals.repository';
import { DealsService } from './deals.service';

/**
 * Deal domain module (DEAL-001): the Deal + DealEvent models, the table-driven
 * transition matrix with role permissions (deals.constants.ts) and the
 * matrix-executor service under DealsService — NO controllers yet (the
 * creation API is DEAL-002, the transition API DEAL-003, the UI DEAL-004,
 * dispute endpoints DEAL-007 P1).
 *
 * Exports service + repository for DEAL-002 (deal creation: validateDealInput
 * + creationEvent + the create-in-one-tx pairing) and DEAL-003 (the
 * transition endpoints execute the matrix through DealsService.transition).
 * The repository is self-contained (no cross-module reads yet —
 * validateDealInput takes the lot/offer rows as plain parameters), so the
 * module imports nothing.
 */
@Module({
  providers: [DealsService, DealsRepository],
  exports: [DealsService, DealsRepository],
})
export class DealsModule {}
