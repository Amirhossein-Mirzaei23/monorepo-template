/**
 * MKT-008 — the filter panel's FORM-level mirror of the browse URL contract
 * (schemas/browse-query.ts, i.e. the GET /lots params — same param names).
 *
 * Why a separate schema: the sheet edits a DRAFT — inputs hold raw text (fa
 * digits, thousand separators, «empty = unset») that must not reach the URL
 * until «اعمال». This module is the one conversion point between the three
 * faces of the same state:
 *
 *   URL params ⇄ LotsBrowseFilter   (browse-query.ts — the API contract)
 *   FiltersFormValues → ParsedFilters (this file — zod-validated draft)
 *
 * Validation mirrors the API where the form can drift: numeric bounds come
 * from the API's MKT-002 caps (LOTS_FILTER_MAX_PRICE/_QUANTITY) and min ≤ max
 * is enforced cross-field, so an invalid draft is blocked client-side instead
 * of surfacing as the API's 400. `lotsBrowseQueryString`/`parseLotsBrowseParams`
 * stay the only URL (de)serializers — the sheet never invents param names.
 */
import { z } from 'zod';
import type { LiquidationReason, LotCondition } from '@monorepo/shared-types';
import { IRAN_PROVINCES } from '@/lib/iran-geo';
import {
  LIQUIDATION_REASONS,
  LOT_CONDITIONS,
  LOTS_FILTER_MAX_PRICE,
  LOTS_FILTER_MAX_QUANTITY,
  LOTS_LISTED_WITHIN_OPTIONS,
  lotsBrowseQueryString,
  PRICING_TYPES,
  type LotsBrowseFilter,
} from './browse-query';

// --- Persian messages (the same strings the sheet renders inline) ---
export const PRICE_BOUNDS_MESSAGE = 'قیمت باید عددی تا ۲٬۰۰۰٬۰۰۰٬۰۰۰ تومان باشد';
export const QTY_BOUNDS_MESSAGE = 'موجودی باید عددی تا ۱٬۰۰۰٬۰۰۰ باشد';
export const PRICE_ORDER_MESSAGE = 'حداقل قیمت نمی‌تواند از حداکثر آن بیشتر باشد';
export const QTY_ORDER_MESSAGE = 'حداقل موجودی نمی‌تواند از حداکثر آن بیشتر باشد';

/** Upper bounds the sheet's helper text shows — the API's MKT-002 filter caps. */
export const FILTERS_MAX_PRICE = LOTS_FILTER_MAX_PRICE;
export const FILTERS_MAX_QUANTITY = LOTS_FILTER_MAX_QUANTITY;

/**
 * Raw numeric input → clean Latin-digit string: fa digits ۰-۹ (and the
 * Arabic-Indic ٠-٩ twins keyboards mix in) → 0-9, thousand separators
 * («٬» U+066C, «,») stripped, trimmed. Anything non-numeric passes through so
 * the zod layer — not this function — rejects it («۱۲۰abc» is invalid, not 120).
 * Money/marketplace convention: users type prices with Persian digits.
 */
export function normalizeNumericInput(raw: string): string {
  let out = '';
  for (const char of raw.trim()) {
    const fa = FA_DIGITS.indexOf(char);
    if (fa >= 0) {
      out += String(fa);
      continue;
    }
    const ar = ARABIC_INDIC_DIGITS.indexOf(char);
    if (ar >= 0) {
      out += String(ar);
      continue;
    }
    if (char === ',' || char === '٬' || char === '\u066c') {
      continue; // thousand separators are presentation, not value
    }
    out += char;
  }
  return out;
}

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** Empty string means "unset" for every select/text field of the draft. */
const optionalShortToken = z
  .string()
  .trim()
  .max(100)
  .transform((value) => (value === '' ? undefined : value));

/** Like optionalShortToken, but the non-empty value must be a known enum member. */
const optionalEnumToken = <T extends string>(values: readonly T[]) =>
  z
    .string()
    .trim()
    .refine(
      (value) => value === '' || (values as readonly string[]).includes(value),
      'مقدار نامعتبر است',
    )
    .transform((value) => (value === '' ? undefined : (value as T)));

/**
 * Raw input text → clean integer within [0, max] (the API's filter cap), or
 * undefined for an empty field. Invalid/out-of-range values become NaN, which
 * the single refine below turns into EXACTLY ONE issue carrying the field's
 * Persian message (no cascading NaN failures).
 */
const numericField = (max: number, message: string) =>
  z
    .string()
    .transform((raw) => {
      const normalized = normalizeNumericInput(raw);
      if (normalized === '') {
        return undefined;
      }
      const value = Number(normalized);
      return Number.isInteger(value) && value >= 0 && value <= max ? value : Number.NaN;
    })
    .refine((value) => value === undefined || !Number.isNaN(value), message);

/**
 * The filter sheet's draft model — every field as the INPUTS hold it (text /
 * '' / arrays). Converted from the URL on open (formValuesFromFilter) and
 * parsed into the URL face on «اعمال» (filtersFormSchema.safeParse).
 */
export interface FiltersFormValues {
  categoryId: string;
  subcategoryId: string;
  priceMin: string;
  priceMax: string;
  qtyMin: string;
  qtyMax: string;
  province: string;
  city: string;
  condition: LotCondition[];
  pricingType: string;
  liquidationReason: LiquidationReason[];
  listedWithin: string;
}

export const EMPTY_FILTERS_FORM: FiltersFormValues = {
  categoryId: '',
  subcategoryId: '',
  priceMin: '',
  priceMax: '',
  qtyMin: '',
  qtyMax: '',
  province: '',
  city: '',
  condition: [],
  pricingType: '',
  liquidationReason: [],
  listedWithin: '',
};

/**
 * Draft → URL face. The output type is structurally the filter subset of
 * LotsBrowseFilter (no q/sort — the sheet never touches them), so
 * `parsed.data` merges straight into the browse query.
 */
export const filtersFormSchema = z
  .object({
    categoryId: optionalShortToken,
    subcategoryId: optionalShortToken,
    priceMin: numericField(FILTERS_MAX_PRICE, PRICE_BOUNDS_MESSAGE),
    priceMax: numericField(FILTERS_MAX_PRICE, PRICE_BOUNDS_MESSAGE),
    qtyMin: numericField(FILTERS_MAX_QUANTITY, QTY_BOUNDS_MESSAGE),
    qtyMax: numericField(FILTERS_MAX_QUANTITY, QTY_BOUNDS_MESSAGE),
    province: optionalShortToken,
    city: optionalShortToken,
    condition: z.array(z.enum(LOT_CONDITIONS as [LotCondition, ...LotCondition[]])),
    pricingType: optionalEnumToken(PRICING_TYPES),
    liquidationReason: z.array(
      z.enum(LIQUIDATION_REASONS as [LiquidationReason, ...LiquidationReason[]]),
    ),
    listedWithin: optionalEnumToken(LOTS_LISTED_WITHIN_OPTIONS),
  })
  .superRefine((values, ctx) => {
    // Cross-field: min ≤ max (card: «zod mirror; min ≤ max enforced»).
    if (
      values.priceMin !== undefined &&
      values.priceMax !== undefined &&
      values.priceMin > values.priceMax
    ) {
      ctx.addIssue({ code: 'custom', path: ['priceMax'], message: PRICE_ORDER_MESSAGE });
    }
    if (
      values.qtyMin !== undefined &&
      values.qtyMax !== undefined &&
      values.qtyMin > values.qtyMax
    ) {
      ctx.addIssue({ code: 'custom', path: ['qtyMax'], message: QTY_ORDER_MESSAGE });
    }
  });

export type ParsedFiltersForm = z.infer<typeof filtersFormSchema>;

/**
 * URL face → draft: the roundtrip half (URL → form → reload reproduces). A
 * stray city (hand-typed URL) is repaired when its province is derivable —
 * city slugs are globally unique (lib/iran-geo.ts) — and dropped otherwise;
 * a city that does not belong to the parsed province degrades to province-only
 * so the sheet's cascade never shows an impossible pair.
 */
export function formValuesFromFilter(filter: LotsBrowseFilter): FiltersFormValues {
  const { province, city } = resolveCityPair(filter.province, filter.city);
  return {
    categoryId: filter.categoryId ?? '',
    subcategoryId: filter.subcategoryId ?? '',
    priceMin: filter.priceMin !== undefined ? String(filter.priceMin) : '',
    priceMax: filter.priceMax !== undefined ? String(filter.priceMax) : '',
    qtyMin: filter.qtyMin !== undefined ? String(filter.qtyMin) : '',
    qtyMax: filter.qtyMax !== undefined ? String(filter.qtyMax) : '',
    province,
    city,
    condition: filter.condition ? [...filter.condition] : [],
    pricingType: filter.pricingType ?? '',
    liquidationReason: filter.liquidationReason ? [...filter.liquidationReason] : [],
    listedWithin: filter.listedWithin ?? '',
  };
}

/** Resolves the province/city pair the cascade can actually display. */
function resolveCityPair(
  provinceSlug: string | undefined,
  citySlug: string | undefined,
): { province: string; city: string } {
  if (!citySlug) {
    return { province: provinceSlug ?? '', city: '' };
  }
  const owner = IRAN_PROVINCES.find((entry) =>
    entry.cities.some((candidate) => candidate.slug === citySlug),
  );
  if (!owner) {
    // Unknown city slug — keep whatever province stands, drop the city.
    return { province: provinceSlug ?? '', city: '' };
  }
  if (provinceSlug && provinceSlug !== owner.slug) {
    // Impossible pair (province ≠ the city's province) — keep the province.
    return { province: provinceSlug, city: '' };
  }
  // Fill the province in when the URL carried a bare city.
  return { province: owner.slug, city: citySlug };
}

// --- URL param surgery shared by the sheet, sort select and active chips ---

/** Every param the filter panel owns — q/sort (and pagination) are never touched by it. */
export const FILTER_PARAM_KEYS = [
  'categoryId',
  'subcategoryId',
  'priceMin',
  'priceMax',
  'qtyMin',
  'qtyMax',
  'city',
  'province',
  'condition',
  'pricingType',
  'liquidationReason',
  'listedWithin',
] as const satisfies ReadonlyArray<Exclude<keyof LotsBrowseFilter, 'q' | 'sort'>>;

export type FilterParamKey = keyof LotsBrowseFilter;

/**
 * Commits a filter patch onto the current search params: every filter param is
 * REPLACED by the patch's (so unsetting a field in the sheet clears it from
 * the URL), q/sort survive untouched. `null` is the reset-all move — filters
 * cleared, q/sort kept (card semantics).
 */
export function commitFiltersToParams(
  current: URLSearchParams,
  patch: LotsBrowseFilter | null,
): URLSearchParams {
  const params = new URLSearchParams(current);
  for (const key of FILTER_PARAM_KEYS) {
    params.delete(key);
  }
  if (patch) {
    // The shared serializer guarantees the URL uses the API's param names.
    for (const [key, value] of new URLSearchParams(lotsBrowseQueryString(patch))) {
      params.append(key, value);
    }
  }
  return params;
}

/** Removes ONE param — a whole key, or a single member of the array params. */
export function removeFilterParamValue(
  current: URLSearchParams,
  key: FilterParamKey,
  value?: string,
): URLSearchParams {
  const params = new URLSearchParams(current);
  if (value === undefined) {
    params.delete(key);
    return params;
  }
  const kept = params.getAll(key).filter((entry) => entry !== value);
  params.delete(key);
  for (const entry of kept) {
    params.append(key, entry);
  }
  return params;
}

/** Path + query for a browse navigation ('' query → bare path, no trailing «?»). */
export function browseHref(pathname: string, params: URLSearchParams): string {
  const query = params.toString();
  return query === '' ? pathname : `${pathname}?${query}`;
}
