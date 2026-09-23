import { Injectable } from '@nestjs/common';
import { LotStatus, type Category, type Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Row shape returned by the tree query (one level of children included). */
export type CategoryWithChildren = Prisma.CategoryGetPayload<{ include: { children: true } }>;

/** Canonical sibling ordering: sortOrder first, nameFa breaks ties (CAT-001). */
export const CATEGORY_TREE_ORDER: readonly Prisma.CategoryOrderByWithRelationInput[] = [
  { sortOrder: 'asc' },
  { nameFa: 'asc' },
];

export type Tx = Prisma.TransactionClient | undefined;

/** Writable subset for PATCH — omitted (undefined) fields stay untouched. */
export type CategoryUpdateData = {
  nameFa?: string;
  nameEn?: string | null;
  slug?: string;
  parentId?: string | null;
  sortOrder?: number;
  isActive?: boolean;
};

/**
 * Data access only. Every method accepts an optional transaction client so
 * the repository stays unit-of-work agnostic — services own transaction
 * boundaries (doc/CONVENTIONS.md → Transactions). Repositories never call
 * $transaction.
 */
@Injectable()
export class CategoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx: Tx): Prisma.TransactionClient | PrismaService {
    return tx ?? this.prisma;
  }

  /**
   * The public two-level tree in one round-trip: active top-level rows with
   * their active children included, both levels ordered by (sortOrder, nameFa)
   * — supported by the (parentId, sortOrder) index. Inactive rows are omitted
   * here but stay resolvable via findById for historical lots.
   */
  async findActiveTree(tx: Tx = undefined): Promise<CategoryWithChildren[]> {
    return this.client(tx).category.findMany({
      where: { isActive: true, parentId: null },
      orderBy: [...CATEGORY_TREE_ORDER],
      include: {
        children: {
          where: { isActive: true },
          orderBy: [...CATEGORY_TREE_ORDER],
        },
      },
    });
  }

  /** No isActive filter on purpose — deactivated categories must stay
   * resolvable by id for historical lots (CAT-001 error states). */
  async findById(id: string, tx: Tx = undefined): Promise<Category | null> {
    return this.client(tx).category.findUnique({ where: { id } });
  }

  /**
   * Rows for an exact set of ids (any depth; active-state checks are the
   * caller's rule). Used by ONB-001 to validate interest ids.
   */
  async findManyByIds(ids: string[], tx: Tx = undefined): Promise<Category[]> {
    return this.client(tx).category.findMany({ where: { id: { in: ids } } });
  }

  async findBySlug(slug: string, tx: Tx = undefined): Promise<Category | null> {
    return this.client(tx).category.findUnique({ where: { slug } });
  }

  async create(
    data: {
      nameFa: string;
      nameEn?: string | null;
      slug: string;
      parentId?: string | null;
      sortOrder: number;
      isActive?: boolean;
    },
    tx: Tx = undefined,
  ): Promise<Category> {
    return this.client(tx).category.create({ data });
  }

  async update(id: string, data: CategoryUpdateData, tx: Tx = undefined): Promise<Category> {
    return this.client(tx).category.update({ where: { id }, data });
  }

  /**
   * Rows sharing a parent: `findByParent(parent.parentId)` = siblings
   * (default `sortOrder` placement, CAT-004), `findByParent(category.id)` =
   * children (has-children re-parent guard, CAT-004). Includes inactive rows —
   * ordering and guard rules are lifecycle-agnostic.
   */
  async findByParent(parentId: string | null, tx: Tx = undefined): Promise<Category[]> {
    return this.client(tx).category.findMany({ where: { parentId } });
  }

  /**
   * The ADMIN full tree (Task 06 GET /admin/categories): top-level rows of
   * BOTH lifecycle states with ALL their children included, one round-trip,
   * the canonical (sortOrder, nameFa) order at both levels. The public
   * `findActiveTree` stays untouched — the public payload must never change.
   */
  async findFullTree(tx: Tx = undefined): Promise<CategoryWithChildren[]> {
    return this.client(tx).category.findMany({
      where: { parentId: null },
      orderBy: [...CATEGORY_TREE_ORDER],
      include: {
        children: {
          orderBy: [...CATEGORY_TREE_ORDER],
        },
      },
    });
  }

  /**
   * Bounded lot aggregates behind the admin tree's two counts (Task 06):
   * exactly FOUR groupBy queries regardless of taxonomy size — lots grouped
   * by their two category references, once for the historical total and once
   * under the marketplace's public-visibility core (status ACTIVE, expiresAt
   * > now, deletedAt null — the exact predicate LotsRepository.findPublic
   * serves, MKT-001).
   *
   * Definitions (mirrored verbatim in AdminCategoryTreeNodeDto):
   * - direct: lots referencing the category as their MAIN category or their
   *   optional SUBCATEGORY, any status — the historical footprint (context
   *   for the editor; explicitly NOT a delete permission).
   * - visible: the subset of those lots that is publicly visible right now.
   * Counts are per-node only — a root never rolls its children's lots up.
   */
  async findLotCounts(now: Date, tx: Tx = undefined): Promise<CategoryLotCounts> {
    const client = this.client(tx);
    const visibleWhere: Prisma.LotWhereInput = {
      status: LotStatus.ACTIVE,
      expiresAt: { gt: now },
      deletedAt: null,
    };
    const [mainAll, subAll, mainVisible, subVisible] = await Promise.all([
      client.lot.groupBy({ by: ['categoryId'], _count: { _all: true } }),
      client.lot.groupBy({
        by: ['subcategoryId'],
        where: { subcategoryId: { not: null } },
        _count: { _all: true },
      }),
      client.lot.groupBy({ by: ['categoryId'], where: visibleWhere, _count: { _all: true } }),
      client.lot.groupBy({
        by: ['subcategoryId'],
        where: { subcategoryId: { not: null }, ...visibleWhere },
        _count: { _all: true },
      }),
    ]);

    const direct = new Map<string, number>();
    for (const row of mainAll) {
      direct.set(row.categoryId, row._count._all);
    }
    const visible = new Map<string, number>();
    for (const row of mainVisible) {
      visible.set(row.categoryId, row._count._all);
    }
    for (const row of subAll) {
      if (row.subcategoryId !== null) {
        direct.set(row.subcategoryId, (direct.get(row.subcategoryId) ?? 0) + row._count._all);
      }
    }
    for (const row of subVisible) {
      if (row.subcategoryId !== null) {
        visible.set(row.subcategoryId, (visible.get(row.subcategoryId) ?? 0) + row._count._all);
      }
    }
    return { direct, visible };
  }
}

/** Per-category lot aggregates for the admin tree (see findLotCounts). */
export interface CategoryLotCounts {
  direct: Map<string, number>;
  visible: Map<string, number>;
}
