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
