import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
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
import type { Request } from 'express';
import { type AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { AdminCategoryTreeNodeDto, CategoryResponseDto } from './dto/category-response.dto';
import { ReorderCategoryDto } from './dto/reorder-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

/**
 * Admin write API for the category taxonomy (CAT-004). Kept inside the
 * categories domain module as a separate @Roles(ADMIN) controller — the
 * public read surface lives in CategoriesController and must never grow
 * write routes. No DELETE by design: deactivation (isActive: false) is the
 * lifecycle; the parent FK stays onDelete: Restrict.
 * Actor and allowlisted request context are forwarded to the transactional service.
 */
@ApiTags('categories')
@ApiBearerAuth('access-token')
@Controller('admin/categories')
export class CategoriesAdminController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({
    type: AdminCategoryTreeNodeDto,
    isArray: true,
    description:
      'Full two-level tree (active AND inactive rows) with parent/order metadata and per-node direct/visible lot counts',
  })
  @ApiOperation({
    summary:
      'Admin category tree — inactive rows included and manageable; counts are informational, there is no hard delete',
  })
  async adminTree(): Promise<AdminCategoryTreeNodeDto[]> {
    return this.categories.adminTree();
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiCreatedResponse({ type: CategoryResponseDto })
  @ApiConflictResponse({ description: 'Slug already in use' })
  @ApiBadRequestResponse({ description: 'Parent not top-level (depth ≤ 2 guard)' })
  @ApiNotFoundResponse({ description: 'parentId does not exist' })
  @ApiOperation({
    summary: 'Create a category — admin only; sortOrder omitted = append after siblings',
  })
  async create(
    @Body() dto: CreateCategoryDto,
    @CurrentUser() user: AuthUser,
    @Req() request: Request & { id?: string },
  ): Promise<CategoryResponseDto> {
    return this.categories.create(dto, auditContext(user, request));
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
    @CurrentUser() user: AuthUser,
    @Req() request: Request & { id?: string },
  ): Promise<CategoryResponseDto> {
    return this.categories.update(id, dto, auditContext(user, request));
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
    @CurrentUser() user: AuthUser,
    @Req() request: Request & { id?: string },
  ): Promise<CategoryResponseDto> {
    return this.categories.reorder(id, dto, auditContext(user, request));
  }
}

function auditContext(user: AuthUser, request: Request & { id?: string }) {
  return {
    actorId: user.sub,
    requestId: request.id ?? 'unknown',
    ip: request.ip ?? request.socket.remoteAddress ?? 'unknown',
  };
}
