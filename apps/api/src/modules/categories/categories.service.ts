import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CategoriesRepository, type CategoryUpdateData, type Tx } from './categories.repository';
import type { CreateCategoryDto } from './dto/create-category.dto';
import type { ReorderCategoryDto } from './dto/reorder-category.dto';
import type { UpdateCategoryDto } from './dto/update-category.dto';
import {
  type CategoryResponseDto,
  type CategoryTreeNodeDto,
  toCategoryResponse,
  toCategoryTreeNode,
} from './dto/category-response.dto';

/**
 * Category business rules (CAT-001 domain, CAT-004 admin writes). The taxonomy
 * is exactly two levels deep; that invariant lives HERE — not in the DB — so
 * every write path (seed fixtures aside) flows through the same guards. The
 * public surface is `tree()`; the admin surface is create/update/reorder.
 *
 * AuditLog: the card calls for AuditLog rows on admin writes, but the
 * `AuditLog` model does not exist in prisma/schema.prisma yet (arrives with a
 * later task) — audit writes are intentionally skipped here (see CAT-004
 * session notes) rather than adding a migration out of scope.
 */
@Injectable()
export class CategoriesService {
  constructor(
    private readonly repository: CategoriesRepository,
    private readonly prisma: PrismaService,
  ) {}

  /** Public two-level tree: active only, ordered by (sortOrder, nameFa). */
  async tree(): Promise<CategoryTreeNodeDto[]> {
    const roots = await this.repository.findActiveTree();
    return roots.map((root) => toCategoryTreeNode(root));
  }

  /**
   * Guarded create — wired to POST /admin/categories (CAT-004). Enforces:
   * parent exists and is top-level (⇒ depth ≤ 2, sub-subcategories throw),
   * slug uniqueness. nameFa length and slug shape are validated by the DTO at
   * the controller boundary. `sortOrder` defaults to append-after-siblings:
   * max sibling sortOrder + 1 (0 when there are no siblings yet).
   */
  async create(input: CreateCategoryDto): Promise<CategoryResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const parent = await this.resolveTopLevelParent(input.parentId, tx);
      const clash = await this.repository.findBySlug(input.slug, tx);
      if (clash) {
        throw new ConflictException(`Category slug "${input.slug}" is already in use`);
      }

      const sortOrder = input.sortOrder ?? (await this.nextSortOrder(parent?.id ?? null, tx));

      const created = await this.repository.create(
        {
          nameFa: input.nameFa,
          nameEn: input.nameEn ?? null,
          slug: input.slug,
          parentId: parent?.id ?? null,
          sortOrder,
          isActive: input.isActive ?? true,
        },
        tx,
      );
      return toCategoryResponse(created);
    });
  }

  /**
   * Guarded update — PATCH /admin/categories/:id (CAT-004). Omitted fields
   * stay untouched. Rules:
   * - slug change must stay globally unique (keeping one's own slug is fine) → 409.
   * - `parentId` re-parents; the target must be a top-level category
   *   (parent-under-parent → 400) and a category that already has children
   *   cannot be nested (its children would become depth-3 → 400). Explicit
   *   `null` moves a category back to the top level. `sortOrder` is not
   *   touched here — ordering is the /reorder endpoint's job.
   * - `isActive: false` deactivates: hidden from the public tree, still
   *   resolvable by id for historical lots (no cascade — lots keep referencing).
   */
  async update(id: string, input: UpdateCategoryDto): Promise<CategoryResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.repository.findById(id, tx);
      if (!current) {
        throw new NotFoundException(`Category ${id} not found`);
      }

      if (input.slug !== undefined && input.slug !== current.slug) {
        const clash = await this.repository.findBySlug(input.slug, tx);
        if (clash && clash.id !== id) {
          throw new ConflictException(`Category slug "${input.slug}" is already in use`);
        }
      }

      const data: CategoryUpdateData = {
        ...(input.nameFa !== undefined ? { nameFa: input.nameFa } : {}),
        ...(input.nameEn !== undefined ? { nameEn: input.nameEn } : {}),
        ...(input.slug !== undefined ? { slug: input.slug } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      };

      if (input.parentId !== undefined && input.parentId !== current.parentId) {
        data.parentId = await this.resolveNewParent(id, input.parentId, tx);
      }

      const updated = await this.repository.update(id, data, tx);
      return toCategoryResponse(updated);
    });
  }

  /**
   * Reorder — PATCH /admin/categories/:id/reorder (CAT-004). The card defines
   * reorder as a sibling `sortOrder` swap: the target's sortOrder is swapped
   * with `siblingId`'s. The target must exist (404), the sibling must exist
   * (404) and be an actual sibling — same `parentId`, both-null = top-level
   * siblings — otherwise 400. Swapping with the category itself is rejected.
   */
  async reorder(id: string, input: ReorderCategoryDto): Promise<CategoryResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const category = await this.repository.findById(id, tx);
      if (!category) {
        throw new NotFoundException(`Category ${id} not found`);
      }
      const sibling = await this.repository.findById(input.siblingId, tx);
      if (!sibling) {
        throw new NotFoundException(`Category ${input.siblingId} not found`);
      }
      if (sibling.id === category.id) {
        throw new BadRequestException('A category cannot be swapped with itself');
      }
      if (sibling.parentId !== category.parentId) {
        throw new BadRequestException(
          'Reorder target must be a sibling of the category (same parent, including top-level)',
        );
      }

      const swapped = await this.repository.update(
        category.id,
        { sortOrder: sibling.sortOrder },
        tx,
      );
      await this.repository.update(sibling.id, { sortOrder: category.sortOrder }, tx);
      return toCategoryResponse(swapped);
    });
  }

  /**
   * Depth-≤-2 guard for new rows: `parentId` must reference an existing
   * top-level category. Nesting under a level-2 row throws BadRequest
   * ("sub-subcategory"); an unknown id throws NotFound.
   */
  private async resolveTopLevelParent(
    parentId: string | null | undefined,
    tx: Tx,
  ): Promise<Awaited<ReturnType<CategoriesRepository['findById']>>> {
    if (parentId == null) {
      return null;
    }
    const parent = await this.repository.findById(parentId, tx);
    if (!parent) {
      throw new NotFoundException(`Parent category ${parentId} not found`);
    }
    if (parent.parentId != null) {
      throw new BadRequestException(
        'Categories are limited to two levels: the parent must be a top-level category',
      );
    }
    return parent;
  }

  /**
   * Re-parent guard for updates: the target must be top-level and different
   * from the category itself, and a category that already has children can
   * never be nested (its children would land at depth 3). Moving to the top
   * level (explicit null) is always allowed.
   */
  private async resolveNewParent(
    id: string,
    parentId: string | null,
    tx: Tx,
  ): Promise<string | null> {
    if (parentId === null) {
      return null;
    }
    if (parentId === id) {
      throw new BadRequestException('A category cannot be its own parent');
    }
    const parent = await this.repository.findById(parentId, tx);
    if (!parent) {
      throw new NotFoundException(`Parent category ${parentId} not found`);
    }
    if (parent.parentId != null) {
      throw new BadRequestException(
        'Categories are limited to two levels: a category can only be moved under a top-level category',
      );
    }
    const children = await this.repository.findByParent(id, tx);
    if (children.length > 0) {
      throw new BadRequestException(
        'A category with children cannot be nested: its children would exceed the two-level limit',
      );
    }
    return parentId;
  }

  /** Append-after-siblings default: max sibling sortOrder + 1, 0 if none. */
  private async nextSortOrder(parentId: string | null, tx: Tx): Promise<number> {
    const siblings = await this.repository.findByParent(parentId, tx);
    return siblings.reduce((max, sibling) => Math.max(max, sibling.sortOrder), -1) + 1;
  }
}
