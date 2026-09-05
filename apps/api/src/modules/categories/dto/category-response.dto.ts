import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Category } from '@prisma/client';

/**
 * Flat representation of a category — the write-path response shape that
 * CAT-004's admin endpoints will return (create/update/reorder).
 */
export class CategoryResponseDto {
  @ApiProperty({ example: 'clx…cuid' })
  id!: string;

  @ApiProperty({ example: 'پوشاک', minLength: 2, maxLength: 50 })
  nameFa!: string;

  @ApiPropertyOptional({ example: 'Apparel', nullable: true, type: String })
  nameEn!: string | null;

  @ApiProperty({ example: 'apparel', pattern: '^[a-z0-9]+(-[a-z0-9]+)*$' })
  slug!: string;

  @ApiPropertyOptional({
    example: 'clx…cuid',
    nullable: true,
    type: String,
    description: 'null = top-level',
  })
  parentId!: string | null;

  @ApiProperty({ example: 1, minimum: 0 })
  sortOrder!: number;

  @ApiProperty({ example: true })
  isActive!: boolean;
}

export function toCategoryResponse(category: Category): CategoryResponseDto {
  return {
    id: category.id,
    nameFa: category.nameFa,
    nameEn: category.nameEn,
    slug: category.slug,
    parentId: category.parentId,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
  };
}

/**
 * Public tree node for GET /categories: active categories only, two levels,
 * no lifecycle fields — consumers (picker, filters, onboarding) never need
 * them (CAT-003/ONB-001).
 */
export class CategoryTreeNodeDto {
  @ApiProperty({ example: 'clx…cuid' })
  id!: string;

  @ApiProperty({ example: 'پوشاک' })
  nameFa!: string;

  @ApiPropertyOptional({ example: 'Apparel', nullable: true, type: String })
  nameEn!: string | null;

  @ApiProperty({ example: 'apparel' })
  slug!: string;

  @ApiProperty({ type: CategoryTreeNodeDto, isArray: true })
  children!: CategoryTreeNodeDto[];
}

/**
 * Accepts both a top-level row (with children included) and a plain
 * level-2 row (no children fetched — the taxonomy stops at depth 2).
 */
export function toCategoryTreeNode(
  node: Category & { children?: Category[] },
): CategoryTreeNodeDto {
  return {
    id: node.id,
    nameFa: node.nameFa,
    nameEn: node.nameEn,
    slug: node.slug,
    children: (node.children ?? []).map((child) => toCategoryTreeNode(child)),
  };
}
