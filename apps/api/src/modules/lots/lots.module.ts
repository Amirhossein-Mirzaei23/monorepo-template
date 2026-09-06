import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { MediaModule } from '../media/media.module';
import { UsersModule } from '../users/users.module';
import { LotsController } from './lots.controller';
import { LotsRepository } from './lots.repository';
import { LotsService } from './lots.service';

/**
 * Lot domain module. LOT-001 delivered the repository; LOT-002 adds the
 * create/edit service + controller; LOT-003 the lifecycle actions; MEDIA-005
 * the gallery replace endpoint. Pulls in Users/Categories for their
 * repositories and Media for MediaRepository (gallery asset ownership checks).
 */
@Module({
  imports: [UsersModule, CategoriesModule, MediaModule],
  controllers: [LotsController],
  providers: [LotsService, LotsRepository],
  exports: [LotsRepository],
})
export class LotsModule {}
