import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CategoryResponseDto } from './dto/category-response.dto';
import { ReorderCategoryDto } from './dto/reorder-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

/**
 * Admin write API for the category taxonomy (CAT-004). Kept inside the
 * categories domain module as a separate @Roles(ADMIN) controller — the
 * public read surface lives in CategoriesController and must never grow
 * write routes. No DELETE by design: deactivation (isActive: false) is the
 * lifecycle; the parent FK stays onDelete: Restrict.
 *
 * AuditLog rows (category:update etc.) are a documented follow-up — the
 * AuditLog model does not exist in the schema yet.
 */
@ApiTags('categories')
@ApiBearerAuth('access-token')
@Controller('admin/categories')
export class CategoriesAdminController {
  constructor(private readonly categories: CategoriesService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiCreatedResponse({ type: CategoryResponseDto })
  @ApiConflictResponse({ description: 'Slug already in use' })
  @ApiBadRequestResponse({ description: 'Parent not top-level (depth ≤ 2 guard)' })
  @ApiNotFoundResponse({ description: 'parentId does not exist' })
  @ApiOperation({
    summary: 'Create a category — admin only; sortOrder omitted = append after siblings',
  })
  async create(@Body() dto: CreateCategoryDto): Promise<CategoryResponseDto> {
    return this.categories.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: CategoryResponseDto })
  @ApiConflictResponse({ description: 'Slug already in use' })
  @ApiBadRequestResponse({ description: 'Parent-under-parent or has-children depth violation' })
  @ApiNotFoundResponse({ description: 'Unknown category or parentId' })
  @ApiOperation({
    summary:
      'Update nameFa/nameEn/slug/parentId/isActive — admin only; reorder via /reorder, no delete (deactivate instead)',
  })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryResponseDto> {
    return this.categories.update(id, dto);
  }

  @Patch(':id/reorder')
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: CategoryResponseDto })
  @ApiBadRequestResponse({
    description: 'Sibling is not an actual sibling (same parentId incl. both-null)',
  })
  @ApiNotFoundResponse({ description: 'Unknown category or sibling id' })
  @ApiOperation({
    summary: 'Swap sortOrder with a sibling category — admin only',
  })
  async reorder(
    @Param('id') id: string,
    @Body() dto: ReorderCategoryDto,
  ): Promise<CategoryResponseDto> {
    return this.categories.reorder(id, dto);
  }
}
