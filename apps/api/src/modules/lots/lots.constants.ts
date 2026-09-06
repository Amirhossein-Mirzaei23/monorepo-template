import { randomBytes } from 'node:crypto';
import type {
  LotCondition,
  LiquidationReason,
  LotStatus,
  LotUnit,
  PricingType,
} from '@prisma/client';

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
