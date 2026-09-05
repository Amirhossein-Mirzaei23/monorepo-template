import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { UsersModule } from '../users/users.module';
import { ProfilesController } from './profiles.controller';
import { ProfilesRepository } from './profiles.repository';
import { ProfilesService } from './profiles.service';

/**
 * Profile domain module (ONB-001). Pulls in Users/Categories for their
 * repositories — the onboarding transaction reads/writes through those
 * repositories (with the tx client), never around them.
 */
@Module({
  imports: [UsersModule, CategoriesModule],
  controllers: [ProfilesController],
  providers: [ProfilesService, ProfilesRepository],
  exports: [ProfilesService, ProfilesRepository],
})
export class ProfilesModule {}
