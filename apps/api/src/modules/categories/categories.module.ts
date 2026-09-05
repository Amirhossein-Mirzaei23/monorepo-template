import { Module } from '@nestjs/common';
import { CategoriesRepository } from './categories.repository';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

/** Category domain module (controller → service → repository). */
@Module({
  controllers: [CategoriesController],
  providers: [CategoriesService, CategoriesRepository],
  exports: [CategoriesService, CategoriesRepository],
})
export class CategoriesModule {}
