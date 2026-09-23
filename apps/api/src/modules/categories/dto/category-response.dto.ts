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

/**
 * Admin tree node for GET /admin/categories (admin panel Task 06): the full
 * write-path row (parent/order/isActive metadata) nested two levels plus two
 * bounded lot counts. Deliberately NOT the public shape — GET /categories
 * keeps serving CategoryTreeNodeDto, active rows only.
 *
 * Count definitions (mirrored verbatim in CategoriesRepository.findLotCounts):
 * - directLotCount: lots referencing the category as their MAIN category or
 *   optional SUBCATEGORY, any status — the historical footprint. Context for
 *   the editor only; it is NEVER a delete permission (no hard delete exists).
 * - visibleLotCount: the subset of those lots publicly visible right now —
 *   status ACTIVE, expiresAt > now, deletedAt null (the marketplace's
 *   findPublic visibility core, MKT-001).
 * Counts are per-node; a root never rolls its children's lots up.
 */
export class AdminCategoryTreeNodeDto extends CategoryResponseDto {
  @ApiProperty({ type: () => AdminCategoryTreeNodeDto, isArray: true })
  children!: AdminCategoryTreeNodeDto[];

  @ApiProperty({
    example: 3,
    minimum: 0,
    description:
      'Lots referencing this category as main category or optional subcategory, any status (historical footprint — not a delete permission)',
  })
  directLotCount!: number;

  @ApiProperty({
    example: 1,
    minimum: 0,
    description:
      'Lots referencing this category that are publicly visible now (status ACTIVE, expiresAt > now, deletedAt null)',
  })
  visibleLotCount!: number;
}

/** The two per-node count maps produced by CategoriesRepository.findLotCounts. */
export interface AdminCategoryCounts {
  direct: Map<string, number>;
  visible: Map<string, number>;
}

/**
 * Accepts a top-level row (children included) or a plain level-2 row and
 * attaches the node's own counts — never a rollup of its children's.
 */
export function toAdminCategoryTreeNode(
  node: Category & { children?: Category[] },
  counts: AdminCategoryCounts,
): AdminCategoryTreeNodeDto {
  return {
    ...toCategoryResponse(node),
    children: (node.children ?? []).map((child) => toAdminCategoryTreeNode(child, counts)),
    directLotCount: counts.direct.get(node.id) ?? 0,
    visibleLotCount: counts.visible.get(node.id) ?? 0,
  };
}
