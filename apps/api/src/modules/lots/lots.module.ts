import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CategoriesModule } from '../categories/categories.module';
import { MediaModule } from '../media/media.module';
import { UsersModule } from '../users/users.module';
import { LotKeyAccessGuard } from './lot-key-access.guard';
import { LotsController } from './lots.controller';
import { LotsRepository } from './lots.repository';
import { LotsService } from './lots.service';

/**
 * Lot domain module. LOT-001 delivered the repository; LOT-002 adds the
 * create/edit service + controller; LOT-003 the lifecycle actions; MEDIA-005
 * the gallery replace endpoint; MKT-009 the public detail route (the shared
 * `GET /lots/:key` guard reuses the global JWT verification, hence the
 * AuthModule import — it exports JwtModule for LotKeyAccessGuard). Pulls in
 * Users/Categories for their repositories and Media for MediaRepository
 * (gallery asset ownership checks).
 */
@Module({
  imports: [AuthModule, UsersModule, CategoriesModule, MediaModule],
  controllers: [LotsController],
  providers: [LotsService, LotsRepository, LotKeyAccessGuard],
  exports: [LotsRepository],
})
export class LotsModule {}
