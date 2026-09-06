import { Injectable } from '@nestjs/common';
import { LotCondition, LotStatus, PricingType, type Lot, type Prisma } from '@prisma/client';
import { Paginated } from '../../common/dto/pagination-query.dto';
import { PrismaService } from '../../prisma/prisma.service';

/** Public browse filters (GET /lots query params, bound in LOT-002 DTOs). */
export interface LotPublicFilters {
  categoryId?: string;
  subcategoryId?: string;
  city?: string;
  province?: string;
  pricingType?: PricingType;
  /** Zero or more merchandising grades — OR semantics (plan §3 LotCondition). */
  condition?: LotCondition[];
  /** Inclusive unit-price bounds in Toman (stored, derived field — plan §12). */
  unitPriceMin?: number;
  unitPriceMax?: number;
  /** Free-text search across title + description (ILIKE, trgm-backed — plan §12). */
  query?: string;
}

export interface FindPublicLotsParams {
  filters?: LotPublicFilters;
  sort?: LotPublicSort;
  page?: number;
  limit?: number;
}

/** Sort allowlist for the public listing — mapped to orderBy below. */
export const LOT_PUBLIC_SORTS = ['newest', 'price-asc', 'price-desc', 'ending-soon'] as const;
export type LotPublicSort = (typeof LOT_PUBLIC_SORTS)[number];

const SORT_ORDER_BY: Record<LotPublicSort, Prisma.LotOrderByWithRelationInput> = {
  newest: { createdAt: 'desc' },
  'price-asc': { unitPrice: 'asc' },
  'price-desc': { unitPrice: 'desc' },
  'ending-soon': { expiresAt: 'asc' },
};

type Tx = Prisma.TransactionClient | undefined;

/**
 * Data access only. Every method accepts an optional transaction client so the
 * repository stays unit-of-work agnostic — services own transaction boundaries
 * (doc/CONVENTIONS.md → Transactions). Repositories never call $transaction.
 */
@Injectable()
export class LotsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx: Tx): Prisma.TransactionClient | PrismaService {
    return tx ?? this.prisma;
  }

  /**
   * Public marketplace listing: only ACTIVE lots, with filter/sort/pagination.
   *
   * Besides `status: ACTIVE` the where clause always carries
   * `expiresAt > now`: rows past their expiry stay ACTIVE until the LOT-006
   * hourly sweep flips them to EXPIRED, and they must never surface to buyers
   * in between (documented decision — the (status, expiresAt) index serves
   * this predicate).
   * `deletedAt: null` is a soft-delete guard: REMOVED lots already fail the
   * status predicate, this keeps the listing correct even if a status edit
   * ever skips the stamp.
   */
  async findPublic(
    { filters = {}, sort = 'newest', page = 1, limit = 20 }: FindPublicLotsParams = {},
    tx: Tx = undefined,
  ): Promise<Paginated<Lot>> {
    const where: Prisma.LotWhereInput = {
      status: LotStatus.ACTIVE,
      expiresAt: { gt: new Date() },
      deletedAt: null,
      ...(filters.categoryId !== undefined ? { categoryId: filters.categoryId } : {}),
      ...(filters.subcategoryId !== undefined ? { subcategoryId: filters.subcategoryId } : {}),
      ...(filters.city !== undefined ? { city: filters.city } : {}),
      ...(filters.province !== undefined ? { province: filters.province } : {}),
      ...(filters.pricingType !== undefined ? { pricingType: filters.pricingType } : {}),
      ...(filters.condition !== undefined && filters.condition.length > 0
        ? { condition: { in: filters.condition } }
        : {}),
      ...(filters.unitPriceMin !== undefined || filters.unitPriceMax !== undefined
        ? {
            unitPrice: {
              ...(filters.unitPriceMin !== undefined ? { gte: filters.unitPriceMin } : {}),
              ...(filters.unitPriceMax !== undefined ? { lte: filters.unitPriceMax } : {}),
            },
          }
        : {}),
      ...(filters.query !== undefined && filters.query.length > 0
        ? {
            // `mode: 'insensitive'` compiles to ILIKE on PostgreSQL, which the
            // pg_trgm GIN indexes (migration lot_001_lot_domain) accelerate.
            OR: [
              { title: { contains: filters.query, mode: 'insensitive' } },
              { description: { contains: filters.query, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const client = this.client(tx);
    const [items, total] = await Promise.all([
      client.lot.findMany({
        where,
        orderBy: SORT_ORDER_BY[sort],
        skip: (page - 1) * limit,
        take: limit,
      }),
      client.lot.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  /** Owner-scoped fetch (seller dashboard/actions) — null for other sellers' lots. */
  async findBySellerAndId(sellerId: string, id: string, tx: Tx = undefined): Promise<Lot | null> {
    return this.client(tx).lot.findFirst({ where: { id, sellerId } });
  }

  async findById(id: string, tx: Tx = undefined): Promise<Lot | null> {
    return this.client(tx).lot.findUnique({ where: { id } });
  }

  async create(data: Prisma.LotUncheckedCreateInput, tx: Tx = undefined): Promise<Lot> {
    return this.client(tx).lot.create({ data });
  }

  async update(id: string, data: Prisma.LotUpdateInput, tx: Tx = undefined): Promise<Lot> {
    return this.client(tx).lot.update({ where: { id }, data });
  }

  /**
   * Atomic counter bumps (plan §12: updateMany, never read-modify-write).
   * Only the provided counters move; returns the number of matched rows
   * (0 for an unknown id).
   */
  async incrementCounters(
    id: string,
    counters: { viewCount?: number; saveCount?: number },
    tx: Tx = undefined,
  ): Promise<number> {
    const data: Prisma.LotUpdateManyMutationInput = {};
    if (counters.viewCount !== undefined && counters.viewCount !== 0) {
      data.viewCount = { increment: counters.viewCount };
    }
    if (counters.saveCount !== undefined && counters.saveCount !== 0) {
      data.saveCount = { increment: counters.saveCount };
    }
    const result = await this.client(tx).lot.updateMany({ where: { id }, data });
    return result.count;
  }
}
