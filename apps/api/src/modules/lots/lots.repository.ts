import { Injectable } from '@nestjs/common';
import {
  LotCondition,
  LotStatus,
  PricingType,
  Prisma,
  type LiquidationReason,
  type Lot,
} from '@prisma/client';
import { Paginated } from '../../common/dto/pagination-query.dto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  FA_QUERY_REPLACEMENTS,
  LOT_SEARCH_SQL_MARKER,
  LOT_SIMILAR_LIMIT,
  normalizeFaQuery,
  type LotCardSort,
} from './lots.constants';

/** Milliseconds in a day — the freshness filter's unit (MKT-002 listedWithin). */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Public browse filters (GET /lots query params, bound in LotsPublicQueryDto
 * by the service — MKT-001 sort/pagination, MKT-002 filters, MKT-003 search).
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
  /** Free-text search (MKT-003) — the RAW trimmed q; normalized here. */
  query?: string;
}

export interface FindPublicLotsParams {
  filters?: LotPublicFilters;
  /** Undefined means "not sent" → relevance ordering when searching (MKT-003). */
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

/**
 * One hit of the MKT-003 search prequery: the lot id plus the relevance flag —
 * whether the lot's NORMALIZED title starts with the NORMALIZED query (the
 * card's "exact-title prefix first"). The id set narrows the Prisma where
 * clause (`id: { in: hits }`); the flag orders the default (no explicit sort)
 * page.
 */
export interface LotSearchHit {
  id: string;
  titlePrefix: boolean;
}

/**
 * Escape SQL LIKE/ILIKE wildcards so the user query matches LITERALLY (card:
 * "q sanitized — no regex semantics"). `\` is the ILIKE default escape char;
 * escaping it first keeps the rest well-formed. Applied AFTER normalization —
 * the replacement table introduces no wildcards.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * MKT-003 — the SQL-side mirror of `normalizeFaQuery`: a nested replace()
 * chain GENERATED from FA_QUERY_REPLACEMENTS (the same table the JS
 * normalizer consumes — one source of truth, no JS/SQL drift; a pair added
 * there lands here automatically). Wraps a raw column expression:
 * `replace(replace(l."title", '۰', '0'), 'ي', 'ی'), …)`.
 */
function faNormalizedSql(column: string): Prisma.Sql {
  return FA_QUERY_REPLACEMENTS.reduce<Prisma.Sql>(
    (expr, [from, to]) => Prisma.sql`replace(${expr}, ${from}, ${to})`,
    Prisma.raw(column),
  );
}

/**
 * MKT-003 search prequery — the ids of ACTIVE, unexpired, non-deleted lots
 * matching `normalizedQuery` on ANY of the card's search arms, in RELEVANCE
 * order (title-prefix hits first, then recency, then id for pagination
 * determinism):
 *
 * - title / description: normalized ILIKE (fa digits, ي/ك, ZWNJ removed on
 *   BOTH sides — query normalized in JS here, columns via the generated
 *   replace() chain).
 * - seller businessName: LEFT JOIN "Profile" (a seller without a profile
 *   simply has no match on this arm — NULL ILIKE is not true).
 * - category + subcategory nameFa: the lot's classification is searchable —
 *   «ورزشی» finds every lot filed under the «کفش ورزشی» subcategory even when
 *   the word appears nowhere in the lot text.
 * - city: RAW ILIKE — slugs are ASCII EN keys (iran-geo), nothing to
 *   normalize.
 *
 * INDEX TRADEOFF (card: "backed by trgm GIN", benchmark @10k): the GIN trgm
 * indexes from LOT-001 sit on the RAW title/description columns; the
 * normalized expressions cannot use them, so this prequery SEQ-SCANS (see the
 * EXPLAIN in the task report). At 10k rows that stays far inside the p50 <
 * 100 ms budget; a normalized-expression index would be a schema decision
 * (deliberately not made here). An index-pure raw-ILIKE OR-arm was rejected:
 * it would match UN-normalized text too, changing semantics for the worse.
 *
 * CONTRACT (FakePrisma + buildLotSearchSql unit test): the leading marker
 * routes FakePrisma's `$queryRaw` to its in-memory emulation, and values[0..2]
 * are exactly [now, containsPattern, prefixPattern] — bound through the scalar
 * CTE so their positions are stable no matter how many replace() pairs the
 * shared table grows.
 */
export function buildLotSearchSql(now: Date, normalizedQuery: string): Prisma.Sql {
  const containsPattern = `%${escapeLikePattern(normalizedQuery)}%`;
  const prefixPattern = `${escapeLikePattern(normalizedQuery)}%`;
  return Prisma.sql`${Prisma.raw(LOT_SEARCH_SQL_MARKER)}
WITH search AS (
  SELECT ${now}::timestamptz AS "now", ${containsPattern} AS "contains", ${prefixPattern} AS "prefix"
)
SELECT l."id",
       (${faNormalizedSql('l."title"')} ILIKE (SELECT "prefix" FROM search)) AS "titlePrefix"
FROM "Lot" l
LEFT JOIN "Profile" p ON p."userId" = l."sellerId"
JOIN "Category" c ON c."id" = l."categoryId"
LEFT JOIN "Category" s ON s."id" = l."subcategoryId"
WHERE l."status" = 'ACTIVE'::"LotStatus"
  AND l."expiresAt" > (SELECT "now" FROM search)
  AND l."deletedAt" IS NULL
  AND (
        ${faNormalizedSql('l."title"')} ILIKE (SELECT "contains" FROM search)
     OR ${faNormalizedSql('l."description"')} ILIKE (SELECT "contains" FROM search)
     OR ${faNormalizedSql('p."businessName"')} ILIKE (SELECT "contains" FROM search)
     OR ${faNormalizedSql('c."nameFa"')} ILIKE (SELECT "contains" FROM search)
     OR ${faNormalizedSql('s."nameFa"')} ILIKE (SELECT "contains" FROM search)
     OR l."city" ILIKE (SELECT "contains" FROM search)
  )
ORDER BY "titlePrefix" DESC, l."createdAt" DESC, l."id" ASC`;
}

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

/**
 * LOT_PUBLIC_DETAIL_INCLUDE (MKT-009) — the public detail include: the FULL
 * ordered gallery (every buyer sees all of it), the seller summary WITH the
 * profile's businessName + city (the detail seller card renders the business
 * location, unlike the listing card), and the category/subcategory NAME rows
 * the spec block renders. Nothing private joins in — exactAddress and
 * rejectionReason are Lot columns, never relations, and the allowlist mapper
 * (toLotPublicDetailResponse) never copies them.
 */
export const LOT_PUBLIC_DETAIL_INCLUDE = {
  seller: {
    select: { id: true, name: true, profile: { select: { businessName: true, city: true } } },
  },
  category: { select: { id: true, nameFa: true, slug: true } },
  subcategory: { select: { id: true, nameFa: true, slug: true } },
  media: { orderBy: { sortOrder: 'asc' as const }, include: { mediaAsset: true } },
} satisfies Prisma.LotInclude;

/** The findPublicDetail row shape (Lot + gallery + seller + category names). */
export type LotDetailRepositoryRow = Prisma.LotGetPayload<{
  include: typeof LOT_PUBLIC_DETAIL_INCLUDE;
}>;

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
 * Seller-scoped PUBLIC params (PROF-002 seller page): exactly one of the two
 * public page states per call.
 */
export type FindSellerPublicLotsParams = {
  status: Extract<LotStatus, 'ACTIVE' | 'SOLD'>;
  page?: number;
  limit?: number;
};

/** Sort per seller-page state: active = newest listing, sold = newest sale (createdAt tiebreak). */
const SELLER_PUBLIC_ORDER_BY: Record<'ACTIVE' | 'SOLD', Prisma.LotOrderByWithRelationInput[]> = {
  ACTIVE: [{ createdAt: 'desc' }],
  SOLD: [{ soldAt: 'desc' }, { createdAt: 'desc' }],
};

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
   * Public marketplace listing (GET /lots, MKT-001 + MKT-002 + MKT-003): only
   * ACTIVE lots, with filter/sort/pagination, returning the CARD row shape
   * (seller summary + cover link joined — see LOT_CARD_INCLUDE) that the
   * service maps onto LotCardResponseDto. The where clause is ONE composition:
   * a fixed visibility core (status + expiry + soft-delete) spread with one
   * arm per supplied filter — absence means "no arm", never "match null".
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
   *
   * MKT-003 search arm: with `filters.query` present the where gains
   * `id: { in: <prequery hits> }` — the prequery (buildLotSearchSql) owns the
   * normalized ILIKE matching (raw SQL; Prisma's where builder cannot express
   * the replace() chain), the visibility core is applied there too so the id
   * set stays minimal, and this method keeps owning ALL other arms so
   * search+filter composition stays one builder. Execution splits on sort:
   *
   * - explicit sort → honor it (card: relevance only for default): ordinary
   *   findMany + count with orderBy/skip/take in the DB, search narrowed by
   *   the id set.
   * - default (no explicit sort) → RELEVANCE: the prequery already returns
   *   hits in (titlePrefix desc, createdAt desc, id asc) order; the filtered
   *   id set is resolved, the page sliced in JS in that order, then only the
   *   page's card rows fetched (3 queries, total = filtered set size).
   *   A normalized-empty query degenerates to "no search arm" (the service
   *   400s it first — this is the ignored-safe fallback for direct calls).
   */
  async findPublic(
    { filters = {}, sort, page = 1, limit = 20 }: FindPublicLotsParams = {},
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
    };
    const client = this.client(tx);

    const rawQuery = filters.query;
    const normalizedQuery =
      rawQuery !== undefined && rawQuery.length > 0 ? normalizeFaQuery(rawQuery) : undefined;
    if (normalizedQuery !== undefined && normalizedQuery.length > 0) {
      const hits = await client.$queryRaw<LotSearchHit[]>(buildLotSearchSql(now, normalizedQuery));
      if (hits.length === 0) {
        return { items: [], total: 0, page, limit };
      }
      const searched: Prisma.LotWhereInput = { ...where, id: { in: hits.map((hit) => hit.id) } };

      // Explicit sort beats relevance (card): order + paginate in the DB.
      if (sort !== undefined) {
        const [items, total] = await Promise.all([
          client.lot.findMany({
            where: searched,
            orderBy: SORT_ORDER_BY[sort],
            include: LOT_CARD_INCLUDE,
            skip: (page - 1) * limit,
            take: limit,
          }),
          client.lot.count({ where: searched }),
        ]);
        return { items, total, page, limit };
      }

      // Relevance: the prequery order IS the final order. Resolve the
      // filtered id set, slice the page out of the ordered hits, fetch the
      // page's card rows, restore the order.
      const matched = await client.lot.findMany({ where: searched, select: { id: true } });
      const matchedIds = new Set(matched.map((row) => row.id));
      const pageIds = hits
        .filter((hit) => matchedIds.has(hit.id))
        .slice((page - 1) * limit, page * limit)
        .map((hit) => hit.id);
      const rows =
        pageIds.length > 0
          ? await client.lot.findMany({
              where: { id: { in: pageIds } },
              include: LOT_CARD_INCLUDE,
            })
          : [];
      const rowsById = new Map(rows.map((row) => [row.id, row]));
      const items = pageIds.flatMap((id) => {
        const row = rowsById.get(id);
        return row !== undefined ? [row] : [];
      });
      return { items, total: matched.length, page, limit };
    }

    const effectiveSort: LotCardSort = sort ?? 'createdAt';
    const [items, total] = await Promise.all([
      client.lot.findMany({
        where,
        orderBy: SORT_ORDER_BY[effectiveSort],
        include: LOT_CARD_INCLUDE,
        skip: (page - 1) * limit,
        take: limit,
      }),
      client.lot.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  /**
   * MKT-009 — single-row lookup BY PUBLIC CODE with the detail include. Only a
   * row-level read: the ACTIVE/unexpired/not-deleted visibility decision lives
   * in LotsService.findPublicByCode (the 404 semantics are business rules).
   */
  async findByCode(code: string, tx: Tx = undefined): Promise<LotDetailRepositoryRow | null> {
    return this.client(tx).lot.findUnique({ where: { code }, include: LOT_PUBLIC_DETAIL_INCLUDE });
  }

  /**
   * MKT-009 — the detail page's similar-lots slice: up to LOT_SIMILAR_LIMIT
   * (8) newest ACTIVE lots in the SAME SUBCATEGORY, backfilled from the parent
   * CATEGORY when the subcategory slice is thin, always excluding the lot
   * itself. Lots without a subcategory search their category directly. The
   * visibility core mirrors findPublic exactly (ACTIVE + expiresAt > now +
   * deletedAt null) — similar lots must never leak paused/draft/expired rows.
   * Two reads worst case (subcategory then category); rows are ordered
   * (createdAt desc, id asc) so ties stay deterministic.
   */
  async findSimilar(
    self: Pick<Lot, 'id' | 'categoryId' | 'subcategoryId'>,
    limit: number = LOT_SIMILAR_LIMIT,
    tx: Tx = undefined,
  ): Promise<LotCardRepositoryRow[]> {
    const now = new Date();
    const visible: Prisma.LotWhereInput = {
      status: LotStatus.ACTIVE,
      expiresAt: { gt: now },
      deletedAt: null,
      id: { not: self.id },
    };
    const orderBy: Prisma.LotOrderByWithRelationInput[] = [{ createdAt: 'desc' }, { id: 'asc' }];
    const client = this.client(tx);

    if (self.subcategoryId === null) {
      return client.lot.findMany({
        where: { ...visible, categoryId: self.categoryId },
        orderBy,
        take: limit,
        include: LOT_CARD_INCLUDE,
      });
    }

    const sameSubcategory = await client.lot.findMany({
      where: { ...visible, subcategoryId: self.subcategoryId },
      orderBy,
      take: limit,
      include: LOT_CARD_INCLUDE,
    });
    if (sameSubcategory.length >= limit) {
      return sameSubcategory;
    }
    // Backfill from the parent category (excluding self + the picked rows) —
    // a thin subcategory should not thin out the whole grid.
    const picked = new Set<string>([self.id, ...sameSubcategory.map((row) => row.id)]);
    const sameCategory = await client.lot.findMany({
      where: { ...visible, categoryId: self.categoryId },
      orderBy,
      take: limit,
      include: LOT_CARD_INCLUDE,
    });
    for (const row of sameCategory) {
      if (sameSubcategory.length >= limit) {
        break;
      }
      if (!picked.has(row.id)) {
        sameSubcategory.push(row);
        picked.add(row.id);
      }
    }
    return sameSubcategory;
  }

  /**
   * PROF-002 — one Paginated page of a seller's PUBLIC lots as CARD rows (the
   * MKT-001 include — seller summary + cover link, no N+1), split by state:
   *
   * - ACTIVE: the exact findPublic visibility core (status + expiresAt > now +
   *   deletedAt null — past-expiry rows never surface between LOT-006 sweeps),
   *   newest listing first. Served by the (sellerId, status) index.
   * - SOLD: newest soldAt first (createdAt tiebreak for pre-soldAt fixtures —
   *   a SOLD row always has soldAt in production flows), so the seller page's
   *   «فروش‌های موفق» shows the freshest proof of business.
   *
   * Unlike findMine (owner inventory: every non-REMOVED status, full gallery),
   * this is a PUBLIC read — only the two buyer-visible states exist here and
   * rows carry only the card include.
   */
  async findPublicBySeller(
    sellerId: string,
    { status, page = 1, limit = 12 }: FindSellerPublicLotsParams,
    tx: Tx = undefined,
  ): Promise<Paginated<LotCardRepositoryRow>> {
    const now = new Date();
    const where: Prisma.LotWhereInput = {
      sellerId,
      status,
      deletedAt: null,
      ...(status === LotStatus.ACTIVE ? { expiresAt: { gt: now } } : {}),
    };
    const [items, total] = await Promise.all([
      this.client(tx).lot.findMany({
        where,
        orderBy: SELLER_PUBLIC_ORDER_BY[status],
        include: LOT_CARD_INCLUDE,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.client(tx).lot.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  /**
   * PROF-002 — the seller page's category chips: one grouped count over the
   * seller's visible ACTIVE lots (same visibility core as findPublicBySeller
   * ACTIVE), `groupBy categoryId` so the whole aggregation is ONE indexed
   * query (no row pull, no N+1). The service resolves the name rows and
   * applies the final order (count desc, then nameFa).
   */
  async countActiveByCategory(
    sellerId: string,
    tx: Tx = undefined,
  ): Promise<Array<{ categoryId: string; _count: { _all: number } }>> {
    const now = new Date();
    const rows = await this.client(tx).lot.groupBy({
      by: ['categoryId'],
      where: {
        sellerId,
        status: LotStatus.ACTIVE,
        expiresAt: { gt: now },
        deletedAt: null,
      },
      _count: { _all: true },
    });
    return rows.map((row) => ({
      categoryId: row.categoryId,
      _count: { _all: row._count._all },
    }));
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
