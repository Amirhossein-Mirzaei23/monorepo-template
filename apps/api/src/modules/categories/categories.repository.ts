import { Injectable } from '@nestjs/common';
import type { Category, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Row shape returned by the tree query (one level of children included). */
export type CategoryWithChildren = Prisma.CategoryGetPayload<{ include: { children: true } }>;

/** Canonical sibling ordering: sortOrder first, nameFa breaks ties (CAT-001). */
export const CATEGORY_TREE_ORDER: readonly Prisma.CategoryOrderByWithRelationInput[] = [
  { sortOrder: 'asc' },
  { nameFa: 'asc' },
];

export type Tx = Prisma.TransactionClient | undefined;

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
}
