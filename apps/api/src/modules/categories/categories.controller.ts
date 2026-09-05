import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CategoryTreeNodeDto } from './dto/category-response.dto';
import { CategoriesService } from './categories.service';

/**
 * Public category read API (CAT-001; CAT-002 folded in). Admin writes
 * (create/update/reorder/toggle) arrive with CAT-004 as a separate
 * @Roles(ADMIN) controller under this module — never here.
 */
@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @Public()
  @ApiOkResponse({
    type: CategoryTreeNodeDto,
    isArray: true,
    description: 'Two-level tree of active categories, ordered by sortOrder then nameFa',
  })
  @ApiOperation({ summary: 'Category tree (active only) — public, no auth' })
  async tree(): Promise<CategoryTreeNodeDto[]> {
    return this.categories.tree();
  }
}
