import { Injectable } from '@nestjs/common';
import {
  LotCondition,
  LotStatus,
  PricingType,
  type LiquidationReason,
  type Lot,
  type Prisma,
} from '@prisma/client';
import { Paginated } from '../../common/dto/pagination-query.dto';
import { PrismaService } from '../../prisma/prisma.service';
import type { LotCardSort } from './lots.constants';

/** Milliseconds in a day — the freshness filter's unit (MKT-002 listedWithin). */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Public browse filters (GET /lots query params, bound in LotsPublicQueryDto
 * by the service — MKT-001 sort/pagination, MKT-002 filters). One optional
 * `query` arm is pre-wired for MKT-003 search.
 */
export interface LotPublicFilters {
  categoryId?: string;
  subcategoryId?: string;
  city?: string;
  province?: string;
  pricingType?: PricingType;
  /** Zero or more merchandising grades — OR semantics (plan §3 LotCondition). */
  condition?: LotCondition[];
  /** Zero or more liquidation stories — OR semantics (plan §3, MKT-002). */
  liquidationReason?: LiquidationReason[];
  /** Inclusive unit-price bounds in Toman (stored, derived field — plan §12). */
  unitPriceMin?: number;
  unitPriceMax?: number;
  /** Inclusive lot-size bounds (MKT-002). */
  quantityMin?: number;
  quantityMax?: number;
  /** Freshness: only lots created within the last N days (MKT-002 7d/30d). */
  listedWithinDays?: number;
  /** Free-text search across title + description (ILIKE, trgm-backed — plan §12). */
  query?: string;
}

export interface FindPublicLotsParams {
  filters?: LotPublicFilters;
  sort?: LotCardSort;
  page?: number;
  limit?: number;
}

/** Owner inventory params (GET /lots/mine, LOT-005) — one optional status tab. */
export interface FindMineLotsParams {
  status?: LotStatus;
  page?: number;
  limit?: number;
}

/**
 * Sort allowlist for the public listing (MKT-001): the card's tokens live in
 * lots.constants.ts (shared with the query DTO); this is the token → orderBy
 * mapping. Directions are FIXED per token (see the constants doc — direction
 * is not client-addressable). `createdAt` desc and `expiresAt` asc are served
 * directly by the LOT-001 (status, createdAt)/(status, expiresAt) indexes;
 * price/quantity/updatedAt sorts fall back to a planner sort over the
 * (status, …) filter — the acceptance EXPLAIN on ~1k lots stays well inside
 * the p50 < 50 ms budget.
 */
const SORT_ORDER_BY: Record<LotCardSort, Prisma.LotOrderByWithRelationInput> = {
  createdAt: { createdAt: 'desc' },
  updatedAt: { updatedAt: 'desc' },
  priceAsc: { unitPrice: 'asc' },
  priceDesc: { unitPrice: 'desc' },
  quantityAsc: { quantity: 'asc' },
  quantityDesc: { quantity: 'desc' },
  expiresAt: { expiresAt: 'asc' },
};

type Tx = Prisma.TransactionClient | undefined;

/**
 * Gallery include for owner-facing single-row reads/writes (MEDIA-005): every
 * lot response carries the ordered `media[]` list, so the create/update/find
 * paths the service maps from always join the links + their assets in. The
 * public LISTING uses its own narrower include (LOT_CARD_INCLUDE above —
 * seller summary + cover only, MKT-001).
 */
export const LOT_MEDIA_INCLUDE = {
  media: { orderBy: { sortOrder: 'asc' as const }, include: { mediaAsset: true } },
} satisfies Prisma.LotInclude;

/**
 * LOT_PUBLIC_CARD_INCLUDE (MKT-001) — the listing include, tuned so one
 * `findMany` call set answers the whole page with NO N+1: Prisma batches the
 * relations of all page rows into two follow-up queries (sellers + their
 * profiles, cover links + their assets), regardless of page size.
 *
 * - `seller`: minimal card summary — {id, name} off the User row + the
 *   Profile's businessName (nullable; profile may not exist yet).
 * - `media`: ONLY the single cover link (isCover — a server invariant from
 *   MEDIA-005) with the asset's thumb/storage keys; the rest of the gallery is
 *   detail-page territory (MKT-009), never fetched for a list page.
 */
export const LOT_CARD_INCLUDE = {
  seller: { select: { id: true, name: true, profile: { select: { businessName: true } } } },
  media: {
    where: { isCover: true },
    take: 1,
    include: { mediaAsset: { select: { thumbKey: true, storageKey: true } } },
  },
} satisfies Prisma.LotInclude;

/** The findPublic row shape (Lot + seller summary + cover link). */
export type LotCardRepositoryRow = Prisma.LotGetPayload<{ include: typeof LOT_CARD_INCLUDE }>;

export type LotWithMedia = Prisma.LotGetPayload<{ include: typeof LOT_MEDIA_INCLUDE }>;

/** One LotMedia row with its joined asset (the gallery include's element type). */
export type LotMediaRow = Prisma.LotMediaGetPayload<{ include: { mediaAsset: true } }>;

/** Payload for one gallery link write (MEDIA-005 replace transaction). */
export interface LotMediaUpsertData {
  mediaAssetId: string;
  sortOrder: number;
  isCover: boolean;
}

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
   * Public marketplace listing (GET /lots, MKT-001 + MKT-002): only ACTIVE
   * lots, with filter/sort/pagination, returning the CARD row shape (seller
   * summary + cover link joined — see LOT_CARD_INCLUDE) that the service maps
   * onto LotCardResponseDto. The where clause is ONE composition: a fixed
   * visibility core (status + expiry + soft-delete) spread with one arm per
   * supplied filter — absence means "no arm", never "match null".
   *
   * Besides `status: ACTIVE` the where clause always carries
   * `expiresAt > now`: rows past their expiry stay ACTIVE until the LOT-006
   * hourly sweep flips them to EXPIRED, and they must never surface to buyers
   * in between (documented decision — the (status, expiresAt) index serves
   * this predicate). `deletedAt: null` is a soft-delete guard: REMOVED lots
   * already fail the status predicate, this keeps the listing correct even if
   * a status edit ever skips the stamp.
   *
   * MKT-002 arms: categoryId/subcategoryId (served by (categoryId, status)),
   * city/province ((city, status)), pricingType, condition[]/reason[] (OR via
   * `in`), inclusive unitPrice/quantity bounds, and listedWithinDays →
   * `createdAt >= now − days`. Bounds are per-field sane (DTO-capped); an
   * inverted min/max pair composes to an empty intersection, not an error —
   * the card's ignored-safe rule. `verifiedSeller` has NO arm yet: its
   * EXISTS subquery needs the TRS-001 verification model (Phase 7).
   */
  async findPublic(
    { filters = {}, sort = 'createdAt', page = 1, limit = 20 }: FindPublicLotsParams = {},
    tx: Tx = undefined,
  ): Promise<Paginated<LotCardRepositoryRow>> {
    // One `now` for the expiry + freshness predicates so a page is answered
    // against a single consistent clock reading.
    const now = new Date();
    const where: Prisma.LotWhereInput = {
      status: LotStatus.ACTIVE,
      expiresAt: { gt: now },
      deletedAt: null,
      ...(filters.categoryId !== undefined ? { categoryId: filters.categoryId } : {}),
      ...(filters.subcategoryId !== undefined ? { subcategoryId: filters.subcategoryId } : {}),
      ...(filters.city !== undefined ? { city: filters.city } : {}),
      ...(filters.province !== undefined ? { province: filters.province } : {}),
      ...(filters.pricingType !== undefined ? { pricingType: filters.pricingType } : {}),
      ...(filters.condition !== undefined && filters.condition.length > 0
        ? { condition: { in: filters.condition } }
        : {}),
      ...(filters.liquidationReason !== undefined && filters.liquidationReason.length > 0
        ? { liquidationReason: { in: filters.liquidationReason } }
        : {}),
      ...(filters.unitPriceMin !== undefined || filters.unitPriceMax !== undefined
        ? {
            unitPrice: {
              ...(filters.unitPriceMin !== undefined ? { gte: filters.unitPriceMin } : {}),
              ...(filters.unitPriceMax !== undefined ? { lte: filters.unitPriceMax } : {}),
            },
          }
        : {}),
      ...(filters.quantityMin !== undefined || filters.quantityMax !== undefined
        ? {
            quantity: {
              ...(filters.quantityMin !== undefined ? { gte: filters.quantityMin } : {}),
              ...(filters.quantityMax !== undefined ? { lte: filters.quantityMax } : {}),
            },
          }
        : {}),
      ...(filters.listedWithinDays !== undefined
        ? { createdAt: { gte: new Date(now.getTime() - filters.listedWithinDays * DAY_MS) } }
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
        include: LOT_CARD_INCLUDE,
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

  /**
   * Seller inventory (GET /lots/mine, LOT-005): every lot the caller owns in a
   * NON-REMOVED status, newest first, with the gallery include (owner rows
   * always carry media[] — same include as the single-row reads).
   *
   * - Default predicate is `status: { notIn: [REMOVED] }` rather than an
   *   explicit allowlist of the current statuses: a future enum member must
   *   show up in the seller's list instead of silently vanishing. REMOVED is
   *   the only status that never belongs in any tab (the card's «deleted lots
   *   are REMOVED and hidden» rule); `deletedAt: null` is the same belt-and-
   *   braces as findPublic.
   * - `status` narrows to exactly one tab (validated against the enum at the
   *   controller).
   * - Sort is FIXED to createdAt desc (newest first) — no sort param on this
   *   endpoint's contract.
   * - Served by the (sellerId, status, updatedAt) index from LOT-001.
   */
  async findMine(
    sellerId: string,
    { status, page = 1, limit = 20 }: FindMineLotsParams = {},
    tx: Tx = undefined,
  ): Promise<Paginated<LotWithMedia>> {
    const where: Prisma.LotWhereInput = {
      sellerId,
      deletedAt: null,
      status: status ?? { notIn: [LotStatus.REMOVED] },
    };
    const client = this.client(tx);
    const [items, total] = await Promise.all([
      client.lot.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: LOT_MEDIA_INCLUDE,
        skip: (page - 1) * limit,
        take: limit,
      }),
      client.lot.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async findById(id: string, tx: Tx = undefined): Promise<LotWithMedia | null> {
    return this.client(tx).lot.findUnique({ where: { id }, include: LOT_MEDIA_INCLUDE });
  }

  async create(data: Prisma.LotUncheckedCreateInput, tx: Tx = undefined): Promise<LotWithMedia> {
    return this.client(tx).lot.create({ data, include: LOT_MEDIA_INCLUDE });
  }

  /**
   * Unchecked variant: callers (LOTS-002 service) set FKs as raw ids
   * (`categoryId`, `subcategoryId: null`) — relation-object syntax is never
   * needed because the service validates rows, not links.
   */
  async update(
    id: string,
    data: Prisma.LotUncheckedUpdateInput,
    tx: Tx = undefined,
  ): Promise<LotWithMedia> {
    return this.client(tx).lot.update({ where: { id }, data, include: LOT_MEDIA_INCLUDE });
  }

  // --- gallery links (MEDIA-005): data access for the service-owned replace tx ---

  async findMediaByLotId(lotId: string, tx: Tx = undefined): Promise<LotMediaRow[]> {
    return this.client(tx).lotMedia.findMany({
      where: { lotId },
      orderBy: { sortOrder: 'asc' },
      include: { mediaAsset: true },
    });
  }

  /**
   * Replace step 1: drop every link NOT in the incoming payload's asset set.
   * `assetIds` empty (clear gallery) deletes all links for the lot.
   */
  async deleteMediaNotIn(
    lotId: string,
    assetIds: readonly string[],
    tx: Tx = undefined,
  ): Promise<number> {
    const result = await this.client(tx).lotMedia.deleteMany({
      where: { lotId, mediaAssetId: { notIn: [...assetIds] } },
    });
    return result.count;
  }

  /**
   * Replace step 2: keep-or-create per payload item. Kept rows are updated in
   * place (row id + createdAt preserved — "replace" never churns unchanged
   * links); the compound unique (lotId, mediaAssetId) is the upsert key.
   */
  async upsertMedia(lotId: string, item: LotMediaUpsertData, tx: Tx = undefined): Promise<void> {
    await this.client(tx).lotMedia.upsert({
      where: { lotId_mediaAssetId: { lotId, mediaAssetId: item.mediaAssetId } },
      create: {
        lotId,
        mediaAssetId: item.mediaAssetId,
        sortOrder: item.sortOrder,
        isCover: item.isCover,
      },
      update: { sortOrder: item.sortOrder, isCover: item.isCover },
    });
  }

  /**
   * LOT-006 hourly sweep: flips every ACTIVE lot whose `expiresAt` passed to
   * EXPIRED in one batched updateMany (idempotent — an already-EXPIRED row no
   * longer matches the status predicate). `deletedAt: null` keeps soft-deleted
   * (REMOVED) rows out even though their status already excludes them — same
   * belt-and-braces as findPublic. Served by the (status, expiresAt) index
   * from LOT-001. Returns the number of flipped rows for the job to log.
   */
  async expireDue(tx: Tx = undefined, now: Date = new Date()): Promise<number> {
    const result = await this.client(tx).lot.updateMany({
      where: {
        status: LotStatus.ACTIVE,
        expiresAt: { lt: now },
        deletedAt: null,
      },
      data: { status: LotStatus.EXPIRED },
    });
    return result.count;
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
