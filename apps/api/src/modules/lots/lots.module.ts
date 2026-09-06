import { Module } from '@nestjs/common';
import { LotsRepository } from './lots.repository';

/**
 * LOT-001 — repository-only module. Controller/service/DTOs land with LOT-002
 * (create/edit API) and LOT-003 (lifecycle actions); register them here as
 * they arrive.
 */
@Module({
  providers: [LotsRepository],
  exports: [LotsRepository],
})
export class LotsModule {}
