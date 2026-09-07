/**
 * MKT-006 — client-side mirror of the public listing query contract
 * (GET /lots; apps/api/src/modules/lots/dto/lots-public-query.dto.ts):
 *
 * - `parseLotsBrowseParams` validates URL params FIELD BY FIELD and DROPS the
 *   malformed ones (bad sort/enum tokens, non-numeric or out-of-range numbers,
 *   over-long strings) — shareable links never crash the page on hand-typed
 *   params; a value the zod shape still rejects after this pass would surface
 *   as the API's 400 → the list's error state.
 * - `lotsBrowseQueryString` is the ONE serializer both fetchers use (BFF +
 *   RSC server hop), so the client never drifts from the API param names
 *   (MKT-008 builds its filter UI on the same names).
 * - `lotCardPageSchema` composes the generated card schema into the
 *   Paginated envelope so contract drift on the browse list fails loudly
 *   (same pattern as the lots feature's lotMinePageSchema).
 */
import { z } from 'zod';
import {
  lotCardResponseSchema,
  type LiquidationReason,
  type LotCardResponseDto,
  type LotCondition,
  type Paginated,
  type PricingType,
} from '@monorepo/shared-types';
import { LOT_CONDITION_LABELS_FA, PRICING_TYPE_LABELS_FA } from '../components/labels';

/** Sort tokens — mirror of the API's LOT_CARD_SORTS allowlist (MKT-001). */
export const LOTS_BROWSE_SORTS = [
  'createdAt',
  'updatedAt',
  'priceAsc',
  'priceDesc',
  'quantityAsc',
  'quantityDesc',
  'expiresAt',
] as const;

export type LotsBrowseSort = (typeof LOTS_BROWSE_SORTS)[number];

/** Freshness tokens — mirror of LOT_LISTED_WITHIN_OPTIONS (MKT-002). */
export const LOTS_LISTED_WITHIN_OPTIONS = ['7d', '30d'] as const;

export type LotsListedWithin = (typeof LOTS_LISTED_WITHIN_OPTIONS)[number];

/** Filter bounds — mirror of the API's LOT_FILTER_MAX_PRICE / _QUANTITY. */
export const LOTS_FILTER_MAX_PRICE = 2_000_000_000;
export const LOTS_FILTER_MAX_QUANTITY = 1_000_000;

/** Browse page size — divisible by the 2/3/4-col grids so pages never end ragged. */
export const LOT_LIST_PAGE_SIZE = 24;

export const LOT_CONDITIONS = Object.keys(LOT_CONDITION_LABELS_FA) as LotCondition[];
export const PRICING_TYPES = Object.keys(PRICING_TYPE_LABELS_FA) as PricingType[];
/** Value mirror of the API's LiquidationReason enum (contextually typed). */
export const LIQUIDATION_REASONS: LiquidationReason[] = [
  'EXCESS_PRODUCTION',
  'CANCELLED_ORDER',
  'EXPORT_RETURN',
  'SEASON_CLEARANCE',
  'OVERSTOCK',
  'FACTORY_CLOSURE',
  'PACKAGING_CHANGE',
  'NEAR_EXPIRY',
  'OTHER',
];

/** Per-value schema shared by the string params (ids/slugs/q upper bound). */
const shortString = z.string().trim().min(1).max(100);

const intParam = (max: number) => z.coerce.number().int().min(0).max(max);

/**
 * Per-field validation schemas — the parser validates each URL param
 * INDEPENDENTLY so one malformed value never discards the valid ones (a bad
 * `sort` is dropped while `condition` members survive, and vice versa).
 */
const SCALAR_SCHEMAS = {
  q: shortString,
  categoryId: shortString,
  subcategoryId: shortString,
  city: shortString,
  province: shortString,
  pricingType: z.enum(PRICING_TYPES as [PricingType, ...PricingType[]]),
  listedWithin: z.enum(LOTS_LISTED_WITHIN_OPTIONS),
  priceMin: intParam(LOTS_FILTER_MAX_PRICE),
  priceMax: intParam(LOTS_FILTER_MAX_PRICE),
  qtyMin: intParam(LOTS_FILTER_MAX_QUANTITY),
  qtyMax: intParam(LOTS_FILTER_MAX_QUANTITY),
  sort: z.enum(LOTS_BROWSE_SORTS),
} as const;

/** Repeatable params — each occurrence is validated against the item schema. */
const ARRAY_ITEM_SCHEMAS = {
  condition: z.enum(LOT_CONDITIONS as [LotCondition, ...LotCondition[]]),
  liquidationReason: z.enum(LIQUIDATION_REASONS as [LiquidationReason, ...LiquidationReason[]]),
} as const;

/**
 * Filter shape a URL (or a category landing scope) resolves to — the query-key
 * face. Structural mirror of LotsPublicQueryDto's optional fields.
 */
export type LotsBrowseFilter = {
  q?: string;
  categoryId?: string;
  subcategoryId?: string;
  city?: string;
  province?: string;
  condition?: LotCondition[];
  pricingType?: PricingType;
  liquidationReason?: LiquidationReason[];
  listedWithin?: LotsListedWithin;
  priceMin?: number;
  priceMax?: number;
  qtyMin?: number;
  qtyMax?: number;
  sort?: LotsBrowseSort;
};

/** Filter shape plus the pagination the fetcher owns — page/limit never go in cache keys. */
export type LotsBrowseQuery = LotsBrowseFilter & { page?: number; limit?: number };

type ScalarLotsBrowseKey = Exclude<keyof LotsBrowseFilter, 'condition' | 'liquidationReason'>;

const SCALAR_KEYS = Object.keys(SCALAR_SCHEMAS) as ReadonlyArray<ScalarLotsBrowseKey>;

const ARRAY_KEYS = Object.keys(ARRAY_ITEM_SCHEMAS) as ReadonlyArray<
  'condition' | 'liquidationReason'
>;

/** Normalizes the two sources the app reads (client hooks, RSC props) to string lists. */
function readValues(
  source: URLSearchParams | Readonly<Record<string, string | string[] | undefined>>,
  key: string,
): string[] {
  if (source instanceof URLSearchParams) {
    return source.getAll(key);
  }
  const value = source[key];
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

/** First defined value of a param, as a string ('' when absent). */
function readFirst(
  source: URLSearchParams | Readonly<Record<string, string | string[] | undefined>>,
  key: string,
): string {
  return readValues(source, key)[0] ?? '';
}

/**
 * URL params → validated browse filters. Every param is validated
 * INDEPENDENTLY; invalid values are dropped while the rest survives (a bad
 * `condition` member among valid ones keeps the valid ones — OR-semantics
 * filters degrade gracefully).
 */
export function parseLotsBrowseParams(
  source: URLSearchParams | Readonly<Record<string, string | string[] | undefined>>,
): LotsBrowseFilter {
  const filter: LotsBrowseFilter = {};

  for (const key of SCALAR_KEYS) {
    const value = readFirst(source, key);
    if (value === '') {
      continue;
    }
    const parsed = SCALAR_SCHEMAS[key].safeParse(value);
    if (parsed.success) {
      // The schema map is keyed by the filter's own keys — data matches the field.
      Object.assign(filter, { [key]: parsed.data });
    }
  }

  for (const key of ARRAY_KEYS) {
    const kept: string[] = [];
    for (const value of readValues(source, key)) {
      const parsed = ARRAY_ITEM_SCHEMAS[key].safeParse(value.trim());
      if (parsed.success) {
        kept.push(parsed.data);
      }
    }
    if (kept.length > 0) {
      Object.assign(filter, { [key]: kept });
    }
  }

  return filter;
}

/**
 * Filters (+ optional pagination) → query string for GET /lots. Fixed key
 * order keeps URLs (and test assertions) deterministic; returns '' for an
 * empty query.
 */
export function lotsBrowseQueryString(query: LotsBrowseQuery): string {
  const params = new URLSearchParams();
  for (const key of SCALAR_KEYS) {
    const value = query[key];
    if (value !== undefined) {
      params.set(key, String(value));
    }
  }
  for (const key of ARRAY_KEYS) {
    for (const value of query[key] ?? []) {
      params.append(key, value);
    }
  }
  if (query.page !== undefined) {
    params.set('page', String(query.page));
  }
  if (query.limit !== undefined) {
    params.set('limit', String(query.limit));
  }
  return params.toString();
}

/** Paginated<LotCardResponseDto> envelope, validated against the generated card schema. */
export const lotCardPageSchema = z.object({
  items: z.array(lotCardResponseSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
});

export type LotCardPage = Paginated<LotCardResponseDto>;
