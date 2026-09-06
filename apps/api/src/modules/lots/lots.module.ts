import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { UsersModule } from '../users/users.module';
import { LotsController } from './lots.controller';
import { LotsRepository } from './lots.repository';
import { LotsService } from './lots.service';

/**
 * Lot domain module. LOT-001 delivered the repository; LOT-002 adds the
 * create/edit service + controller (lifecycle actions arrive with LOT-003).
 * Pulls in Users/Categories for their repositories — the service reads the
 * seller's accountRoles and validates category rows through them.
 */
@Module({
  imports: [UsersModule, CategoriesModule],
  controllers: [LotsController],
  providers: [LotsService, LotsRepository],
  exports: [LotsRepository],
})
export class LotsModule {}
