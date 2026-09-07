import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { LotsModule } from '../lots/lots.module';
import { UsersModule } from '../users/users.module';
import { ProfilesController } from './profiles.controller';
import { PublicProfilesController } from './public-profiles.controller';
import { ProfilesRepository } from './profiles.repository';
import { ProfilesService } from './profiles.service';

/**
 * Profile domain module (ONB-001). Pulls in Users/Categories for their
 * repositories — the onboarding transaction reads/writes through those
 * repositories (with the tx client), never around them. Lots joins for its
 * repository (PROF-002): the public seller page's category aggregation and
 * active/sold card pages are lot queries served through LotsRepository.
 */
@Module({
  imports: [UsersModule, CategoriesModule, LotsModule],
  controllers: [ProfilesController, PublicProfilesController],
  providers: [ProfilesService, ProfilesRepository],
  exports: [ProfilesService, ProfilesRepository],
})
export class ProfilesModule {}
