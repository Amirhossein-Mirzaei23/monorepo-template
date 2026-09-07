import { randomBytes } from 'node:crypto';
// LotStatus is used as a VALUE below (transition-table targets), unlike the
// other enums which only type the label maps.
import { LotStatus } from '@prisma/client';
import type { LotCondition, LiquidationReason, LotUnit, PricingType } from '@prisma/client';

/**
 * Persian display labels for the Lot enums (plan §3) — the single source the
 * web app renders through generated API types; never hardcode fa strings in
 * components. Keys are exhaustive per enum (Record<Enum, string> keeps the
 * maps compile-time synced with the Prisma enums).
 */

export const LOT_STATUS_LABELS_FA: Record<LotStatus, string> = {
  DRAFT: 'پیش‌نویس',
  PENDING_REVIEW: 'در انتظار بررسی',
  ACTIVE: 'فعال',
  PAUSED: 'موقتاً غیرفعال',
  REJECTED: 'رد شده',
  EXPIRED: 'منقضی شده',
  SOLD: 'فروخته شده',
  REMOVED: 'حذف شده',
};

export const LOT_CONDITION_LABELS_FA: Record<LotCondition, string> = {
  GRADE_A: 'درجه A',
  GRADE_B: 'درجه B',
  GRADE_C: 'درجه C',
  MIXED: 'مختلط',
  NEW: 'نو',
  USED: 'کارکرده',
  DAMAGED: 'آسیب‌دیده',
  NEAR_EXPIRY: 'نزدیک انقضا',
};

export const LIQUIDATION_REASON_LABELS_FA: Record<LiquidationReason, string> = {
  EXCESS_PRODUCTION: 'تولید مازاد',
  CANCELLED_ORDER: 'سفارش لغو شده',
  EXPORT_RETURN: 'مرجوعی صادرات',
  SEASON_CLEARANCE: 'تخفیف فصلی',
  OVERSTOCK: 'انباشت موجودی',
  FACTORY_CLOSURE: 'تعطیلی کارگاه',
  PACKAGING_CHANGE: 'تغییر بسته‌بندی',
  NEAR_EXPIRY: 'نزدیک انقضا',
  OTHER: 'سایر',
};

export const PRICING_TYPE_LABELS_FA: Record<PricingType, string> = {
  FIXED: 'قیمت ثابت',
  NEGOTIABLE: 'قابل مذاکره',
};

export const LOT_UNIT_LABELS_FA: Record<LotUnit, string> = {
  PIECE: 'عدد',
  SET: 'ست',
  BOX: 'کارتن',
  KG: 'کیلوگرم',
  PAIR: 'جفت',
  OTHER: 'سایر',
};

/**
 * `code` is the public URL id of a lot (plan §3/§12): 8 base62 chars from
 * crypto.randomBytes — non-sequential so internal cuids stay private.
 * Hand-rolled (no nanoid dependency); the space (62^8 ≈ 2.2e14) makes
 * collisions unlikely, and unique-violation retries are a service-layer
 * concern (LOT-002 create path).
 */
const LOT_CODE_LENGTH = 8;
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
// 4 * 62 = 248: randomBytes values ≥ 248 would bias `byte % 62` toward the
// first 8 alphabet entries, so they are discarded (rejection sampling).
const BASE62_REJECT_THRESHOLD = 248;

export function generateLotCode(): string {
  let code = '';
  while (code.length < LOT_CODE_LENGTH) {
    for (const byte of randomBytes(LOT_CODE_LENGTH)) {
      if (byte >= BASE62_REJECT_THRESHOLD) {
        continue;
      }
      code += BASE62[byte % BASE62.length];
      if (code.length === LOT_CODE_LENGTH) {
        return code;
      }
    }
  }
  return code;
}

/**
 * Create/edit validation bounds (LOT-002, card "validations"). DTOs carry the
 * coarse per-field guards; LotsService re-asserts the business-critical ones so
 * every write path (create AND patch, incl. LOT-003 later) shares one source.
 */
export const LOT_TITLE_MIN_CODEPOINTS = 5;
export const LOT_TITLE_MAX_CODEPOINTS = 120;
export const LOT_DESCRIPTION_MAX = 5000;
export const LOT_LOCATION_HINT_MAX = 100;
export const LOT_EXACT_ADDRESS_MAX = 300;
/** Toman bounds for `totalPrice` (plan §3: money is Int, ≤ 2,000,000,000). */
export const LOT_MIN_TOTAL_PRICE = 1;
export const LOT_MAX_TOTAL_PRICE = 2_000_000_000;
/**
 * Listing expiry window: stamps `expiresAt` at create AND refreshed at every
 * submit (PATCH submit=true). Drafts get it too so the `findPublic` safety
 * filter (expiresAt > now) and the ending-soon sort stay total.
 */
export const LOT_DEFAULT_EXPIRY_DAYS = 30;
/** Unique-code retries on create before giving up (P2002 → new code → 500). */
export const LOT_CODE_MAX_CREATE_ATTEMPTS = 3;

/**
 * MKT-001 — the `sort` allowlist of the public listing (GET /lots). Values are
 * FULL sort tokens, not `field:dir` pairs: the card enumerates them as
 * single words (`priceAsc`, `expiresAt`…), each with a fixed direction (the
 * buyer-facing semantic — e.g. `expiresAt` is always "ending soon" asc), so
 * direction is not client-addressable. That keeps future sorts (best-deal,
 * distance, popularity) additive and gives an exact 400 on anything else.
 * The token → orderBy mapping lives in LotsRepository (SORT_ORDER_BY).
 */
export const LOT_CARD_SORTS = [
  'createdAt', // newest first — the default
  'updatedAt', // recently edited first
  'priceAsc',
  'priceDesc',
  'quantityAsc',
  'quantityDesc',
  'expiresAt', // ending soon
] as const;

export type LotCardSort = (typeof LOT_CARD_SORTS)[number];

/**
 * MKT-002 — freshness filter tokens (GET /lots?listedWithin=). Values are the
 * card's two windows; `token → days` lives in LOT_LISTED_WITHIN_DAYS and the
 * repository turns it into `createdAt >= now − days`.
 */
export const LOT_LISTED_WITHIN_OPTIONS = ['7d', '30d'] as const;

export type LotListedWithin = (typeof LOT_LISTED_WITHIN_OPTIONS)[number];

export const LOT_LISTED_WITHIN_DAYS: Record<LotListedWithin, number> = {
  '7d': 7,
  '30d': 30,
};

/**
 * MKT-003 — free-text search (`q` on GET /lots) bounds. The DTO enforces the
 * upper bound mechanically (trim + MaxLength); the service enforces the lower
 * bound as a business rule so the 400 can carry the SEARCH_QUERY_TOO_SHORT
 * code (the card's fa copy «جستجو حداقل ۲ کاراکتر» is web-side — the API
 * returns machine messages + codes).
 */
export const SEARCH_QUERY_MIN_LENGTH = 2;
export const SEARCH_QUERY_MAX_LENGTH = 100;

/**
 * MKT-003 — the ONE source of truth for Persian text normalization, consumed
 * by BOTH matching sides so they cannot drift:
 *
 * - JS side: `normalizeFaQuery()` below (the query string, and the FakePrisma's
 *   emulation of the stored columns in tests).
 * - SQL side: LotsRepository builds its nested replace() chain by iterating
 *   THIS table, so a pair added here automatically lands in the SQL too.
 *
 * Pairs (card: «ي→ی», «ك→ک», fa digits, ZWNJ removal for matching):
 * - Persian digits ۰-۹ (U+06F0-06F9) → ASCII 0-9 — «پیراهن ۵۰» must match a
 *   title written with Latin digits.
 * - Arabic yeh ي (U+064A) → Persian yeh ی (U+06CC) and Arabic kaf ك (U+0643)
 *   → Persian kaf ک (U+06A9) — Arabic-keyboard text is common.
 * - ZWNJ (U+200C, «نیم‌فاصله») → removed — «تیشرت» must find «تی‌شرت» and vice
 *   versa. Removal (not space) keeps the normalized forms equal on both sides.
 *
 * DELIBERATELY ABSENT: Arabic-Indic digits ٠-٩ (U+0660-0669), آ/ا folding,
 * ة/ه folding — none are in the card; each is additive here (tests + this
 * comment) if real-world queries demand them.
 */
export const FA_QUERY_REPLACEMENTS: ReadonlyArray<readonly [string, string]> = [
  ['۰', '0'],
  ['۱', '1'],
  ['۲', '2'],
  ['۳', '3'],
  ['۴', '4'],
  ['۵', '5'],
  ['۶', '6'],
  ['۷', '7'],
  ['۸', '8'],
  ['۹', '9'],
  ['ي', 'ی'],
  ['ك', 'ک'],
  ['\u200c', ''],
];

/**
 * MKT-003 — normalize a search query (or any fa text) for matching: apply the
 * shared replacement table, collapse whitespace runs to one space, trim.
 * Pure and idempotent; split/join (not regex) mirrors SQL replace() semantics
 * exactly — every occurrence replaced, literal, no pattern syntax.
 */
export function normalizeFaQuery(query: string): string {
  let normalized = query;
  for (const [from, to] of FA_QUERY_REPLACEMENTS) {
    normalized = normalized.split(from).join(to);
  }
  return normalized.replace(/\s+/g, ' ').trim();
}

/**
 * MKT-003 — leading marker of the search prequery SQL built in
 * LotsRepository.buildLotSearchSql. The only raw-SQL statement in the app
 * beyond health checks, so FakePrisma's `$queryRaw` dispatches on this exact
 * prefix (health checks keep their `[{ ok: 1 }]` stub). A shared constant —
 * not an inline string — because a rename must move BOTH sides or every
 * search test silently falls back to the health stub.
 */
export const LOT_SEARCH_SQL_MARKER = '/* lot_public_search */';

/**
 * MKT-002 filter-param bounds (card: "price ≤ 2B, qty ≤ 1M") — a filter can
 * never reach past the write-path caps: the price filter shares the totalPrice
 * money ceiling and quantity gets the plan's 1M sanity cap. Lower bound is 0
 * for both (DTO Min(0)) — filters are reads, the ≥ 1 business minimums apply
 * to writes only.
 */
export const LOT_FILTER_MAX_PRICE = LOT_MAX_TOTAL_PRICE;
export const LOT_FILTER_MAX_QUANTITY = 1_000_000;

/**
 * MKT-009 — key-shape dispatch for the SHARED `GET /lots/:key` path pattern.
 * The plan's API surface serves both `GET /lots/:code` (public detail) and the
 * LOT-005 owner read `GET /lots/:id` on the same single-segment path, and
 * Express matches in declaration order — two separate handlers cannot coexist.
 * One route therefore dispatches on THIS test: a code is EXACTLY 8 base62
 * chars (generateLotCode's output space) while Prisma cuids are 25 chars, so
 * the two key spaces are disjoint and a shape test is total.
 */
const LOT_CODE_PATTERN = /^[0-9A-Za-z]{8}$/;

/** True when the `:key` path segment is a public lot CODE (not an internal id). */
export function isLotPublicCode(key: string): boolean {
  return LOT_CODE_PATTERN.test(key);
}

/**
 * MKT-009 — view-counter dedup heuristic: the detail endpoint sets one cookie
 * per lot code (`lot_view_{code}`) for 30 minutes and bumps viewCount only
 * when it is absent — 1 counted view per code per visitor per 30 min.
 * DOCUMENTED LIMITATION: the cookie dedups DIRECT API visitors; the web RSC
 * fetches server-to-server without browser cookies, so SSR loads count once
 * per render until the BFF forwards cookies to the API (follow-up).
 */
export const LOT_VIEW_COOKIE_PREFIX = 'lot_view_';
export const LOT_VIEW_DEDUP_MINUTES = 30;

/** Cookie name for the dedup marker of one lot code. */
export function lotViewCookieName(code: string): string {
  return `${LOT_VIEW_COOKIE_PREFIX}${code}`;
}

/** MKT-009 — the similar-lots slice size (card: "up to 8 newest"). */
export const LOT_SIMILAR_LIMIT = 8;

/** Machine-readable error codes carried on 403/409 bodies (LOT-002/LOT-003). */
export const LOT_ERROR_CODES = {
  /** Authenticated user without the SELLER hat (fa copy lives web-side). */
  SELLER_REQUIRED: 'SELLER_REQUIRED',
  /** PATCH touching fields that are locked for the lot's current status. */
  ILLEGAL_STATUS_EDIT: 'ILLEGAL_STATUS_EDIT',
  /** POST /lots/:id/{submit|pause|resume|mark-sold|duplicate} or DELETE on a
   * status whose transition table has no entry for the action (LOT-003). */
  ILLEGAL_TRANSITION: 'ILLEGAL_TRANSITION',
  /** resume() on a PAUSED lot whose expiresAt already passed (LOT-003):
   * findPublic's expiresAt > now safety filter would hide it immediately,
   * so the row must not come back ACTIVE — duplicate it to re-list. */
  EXPIRED: 'EXPIRED',
  /** PUT /lots/:id/media references a MediaAsset that does not exist OR is
   * owned by someone else (MEDIA-005) — uniform 403, no existence oracle for
   * unguessable asset ids. */
  MEDIA_NOT_OWNED: 'MEDIA_NOT_OWNED',
  /** Gallery exceeds a per-kind cap: uploads.maxLotImages (15) images or
   * uploads.maxLotVideos (3) videos (MEDIA-005; message carries the counts). */
  MEDIA_CAP_EXCEEDED: 'MEDIA_CAP_EXCEEDED',
  /** The same mediaAssetId appears twice in one PUT payload (MEDIA-005) —
   * would violate the (lotId, mediaAssetId) unique. */
  MEDIA_DUPLICATED: 'MEDIA_DUPLICATED',
  /** GET /lots?q= shorter than SEARCH_QUERY_MIN_LENGTH code points, or empty
   * after normalization (e.g. ZWNJ-only) — nothing searchable (MKT-003; the
   * card's «جستجو حداقل ۲ کاراکتر» renders web-side from this code). */
  SEARCH_QUERY_TOO_SHORT: 'SEARCH_QUERY_TOO_SHORT',
  /** coverIndex outside 0..items.length-1, or provided for an empty gallery
   * (MEDIA-005; a cover on zero items is meaningless). */
  COVER_INDEX_OUT_OF_BOUNDS: 'COVER_INDEX_OUT_OF_BOUNDS',
} as const;

/**
 * Seller lifecycle actions (LOT-003) — the `POST /lots/:id/<action>` path
 * suffix and the key of the transition table below.
 */
export const LOT_ACTIONS = [
  'submit',
  'pause',
  'resume',
  'mark-sold',
  'duplicate',
  'delete',
] as const;
export type LotAction = (typeof LOT_ACTIONS)[number];

/**
 * LOT-003 state machine, table-driven (the card's "allowed transitions").
 * `LOT_TRANSITIONS[status][action] = target` is a LEGAL move; a missing entry
 * is an illegal move → 409 ILLEGAL_TRANSITION. Read as:
 *
 * | status \ action   | submit          | pause   | resume  | mark-sold | duplicate | delete  |
 * |-------------------|-----------------|---------|---------|-----------|-----------|---------|
 * | DRAFT             | PENDING_REVIEW  | —       | —       | —         | DRAFT*    | REMOVED |
 * | PENDING_REVIEW    | —               | —       | —       | —         | DRAFT*    | REMOVED |
 * | ACTIVE            | —               | PAUSED  | —       | SOLD      | DRAFT*    | REMOVED |
 * | PAUSED            | —               | —       | ACTIVE† | SOLD      | DRAFT*    | REMOVED |
 * | REJECTED          | PENDING_REVIEW  | —       | —       | —         | DRAFT*    | REMOVED |
 * | EXPIRED           | —               | —       | —       | —         | DRAFT*    | REMOVED |
 * | SOLD              | —               | —       | —       | —         | DRAFT*    | — (409) |
 * | REMOVED           | — (terminal)    | —       | —       | —         | —         | — (409) |
 *
 * `*` duplicate does NOT transition the source row — it CREATES A NEW lot in
 * DRAFT (fresh code, +30d expiry, zeroed counters; see LotsService.duplicate).
 * It is allowed from every status except REMOVED (a removed lot's content is
 * gone for good) and works from SOLD/EXPIRED so sellers can re-list.
 *
 * `†` resume has an extra time-based guard in the service: a PAUSED lot whose
 * `expiresAt` already passed cannot resume (409 EXPIRED) — otherwise it would
 * be created ACTIVE-in-name-only and immediately hidden by the findPublic
 * `expiresAt > now` safety filter.
 *
 * Remoderation via submit is only reachable from DRAFT/REJECTED (ACTIVE lots
 * were already approved; edits while listed follow the LOT-002 PATCH rules).
 *
 * Side effects per action (service-owned, tested table-driven over EVERY
 * (status, action) pair — 8 × 6): submit refreshes expiresAt (+30d) and clears
 * rejectionReason on REJECTED; mark-sold stamps soldAt=now and zeroes
 * availableQuantity; delete (soft) stamps deletedAt=now.
 *
 * FOLLOW-UP (AuditLog): the card asks for AuditLog rows on self transitions,
 * but the AuditLog model does not exist yet (CAT-004 decision — introduced
 * with the admin/trust phase). Until that model lands, transitions are NOT
 * recorded; add the write here (action name + actor + lot id) when it does.
 */
export const LOT_TRANSITIONS: Record<LotStatus, Partial<Record<LotAction, LotStatus>>> = {
  DRAFT: {
    submit: LotStatus.PENDING_REVIEW,
    duplicate: LotStatus.DRAFT,
    delete: LotStatus.REMOVED,
  },
  PENDING_REVIEW: {
    duplicate: LotStatus.DRAFT,
    delete: LotStatus.REMOVED,
  },
  ACTIVE: {
    pause: LotStatus.PAUSED,
    'mark-sold': LotStatus.SOLD,
    duplicate: LotStatus.DRAFT,
    delete: LotStatus.REMOVED,
  },
  PAUSED: {
    resume: LotStatus.ACTIVE,
    'mark-sold': LotStatus.SOLD,
    duplicate: LotStatus.DRAFT,
    delete: LotStatus.REMOVED,
  },
  REJECTED: {
    submit: LotStatus.PENDING_REVIEW,
    duplicate: LotStatus.DRAFT,
    delete: LotStatus.REMOVED,
  },
  EXPIRED: {
    duplicate: LotStatus.DRAFT,
    delete: LotStatus.REMOVED,
  },
  SOLD: {
    duplicate: LotStatus.DRAFT,
  },
  REMOVED: {},
};
