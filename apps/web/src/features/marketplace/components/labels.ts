import type { LotCondition, LotUnit, PricingType } from '@monorepo/shared-types';

/**
 * Persian display labels for the lot-card enums (MKT-005) — the marketplace
 * feature's own copy of the API's lots.constants.ts maps (apps/api/src/modules/
 * lots/lots.constants.ts). The API constants are server-side and the seller-side
 * lots feature's identical maps are behind its feature boundary, so buyer
 * surfaces keep their own copy — same pattern as the onboarding feature's
 * SELLER_BUSINESS_TYPE_LABELS_FA. Keys are exhaustive per generated enum
 * (Record<Enum, string> keeps the maps compile-time synced with the API).
 */
export const LOT_UNIT_LABELS_FA: Record<LotUnit, string> = {
  PIECE: 'عدد',
  SET: 'ست',
  BOX: 'کارتن',
  KG: 'کیلوگرم',
  PAIR: 'جفت',
  OTHER: 'سایر',
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

export const PRICING_TYPE_LABELS_FA: Record<PricingType, string> = {
  FIXED: 'قیمت ثابت',
  NEGOTIABLE: 'قابل مذاکره',
};
