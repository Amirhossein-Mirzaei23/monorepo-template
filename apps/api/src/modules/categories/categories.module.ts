import { Module } from '@nestjs/common';
import { CategoriesRepository } from './categories.repository';
import { CategoriesAdminController } from './categories-admin.controller';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

/** Category domain module (controller → service → repository). */
@Module({
  controllers: [CategoriesController, CategoriesAdminController],
  providers: [CategoriesService, CategoriesRepository],
  exports: [CategoriesService, CategoriesRepository],
})
export class CategoriesModule {}
