import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CategoriesRepository, type Tx } from './categories.repository';
import type { CreateCategoryDto } from './dto/create-category.dto';
import {
  type CategoryResponseDto,
  type CategoryTreeNodeDto,
  toCategoryResponse,
  toCategoryTreeNode,
} from './dto/category-response.dto';

/**
 * Category business rules (CAT-001). The taxonomy is exactly two levels deep;
 * that invariant lives HERE — not in the DB — so every write path (seed
 * fixtures aside) flows through the same guards. The public surface is
 * `tree()`; guarded writes (`create`) exist for CAT-004's admin endpoints.
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
   * Guarded create — no controller exposes it yet (CAT-004 wires it to
   * POST /admin/categories). Enforces: parent exists and is top-level
   * (⇒ depth ≤ 2, sub-subcategories throw), slug uniqueness. nameFa length
   * and slug shape are validated by the DTO at the controller boundary.
   */
  async create(input: CreateCategoryDto): Promise<CategoryResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const parent = await this.resolveTopLevelParent(input.parentId, tx);
      const clash = await this.repository.findBySlug(input.slug, tx);
      if (clash) {
        throw new ConflictException(`Category slug "${input.slug}" is already in use`);
      }

      const created = await this.repository.create(
        {
          nameFa: input.nameFa,
          nameEn: input.nameEn ?? null,
          slug: input.slug,
          parentId: parent?.id ?? null,
          sortOrder: input.sortOrder,
          isActive: input.isActive ?? true,
        },
        tx,
      );
      return toCategoryResponse(created);
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
}
