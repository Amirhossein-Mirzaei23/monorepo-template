/**
 * Client-side lot form schema (LOT-004) — mirrors the API's CreateLotDto /
 * UpdateLotDto rules (apps/api/src/modules/lots/dto + LotsService) with
 * Persian messages. The hand-written shape drives the wizard UX (cross-field
 * quantity rules, per-step validation, fa copy); the response side is parsed
 * with the generated `lotOwnerResponseSchema` from @monorepo/shared-types.
 *
 * Enum fa label maps mirror the API's lots.constants.ts (the API constants are
 * server-side; the web needs its own copy keyed off the generated enum types —
 * Record<Enum, string> keeps them compile-time synced).
 */
import { z } from 'zod';
import type {
  LiquidationReason,
  LotCondition,
  LotStatus,
  LotUnit,
  PricingType,
} from '@monorepo/shared-types';
import { formatFaDigits } from '@/lib/format';
import { IRAN_PROVINCES, findIranCity } from '@/lib/iran-geo';

// --- bounds (LOT-002: lots.constants.ts mirror) ---
export const LOT_TITLE_MIN = 5;
export const LOT_TITLE_MAX = 120;
export const LOT_DESCRIPTION_MAX = 5000;
export const LOT_LOCATION_HINT_MAX = 100;
export const LOT_EXACT_ADDRESS_MAX = 300;
export const LOT_MAX_TOTAL_PRICE = 2_000_000_000;

// --- enum fa labels (exhaustive over the generated types) ---
export const LOT_UNIT_LABELS_FA: Record<LotUnit, string> = {
  PIECE: 'عدد',
  SET: 'ست',
  BOX: 'کارتن',
  KG: 'کیلوگرم',
  PAIR: 'جفت',
  OTHER: 'سایر',
};

export const PRICING_TYPE_LABELS_FA: Record<PricingType, string> = {
  FIXED: 'قیمت ثابت',
  NEGOTIABLE: 'قابل مذاکره',
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

export const LOT_UNITS = Object.keys(LOT_UNIT_LABELS_FA) as LotUnit[];
export const PRICING_TYPES = Object.keys(PRICING_TYPE_LABELS_FA) as PricingType[];
export const LOT_CONDITIONS = Object.keys(LOT_CONDITION_LABELS_FA) as LotCondition[];
export const LIQUIDATION_REASONS = Object.keys(LIQUIDATION_REASON_LABELS_FA) as LiquidationReason[];

/** Empty string (the select placeholder) means "not chosen yet". */
const enumField = <T extends string>(values: readonly T[], message: string) =>
  z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    z.enum(values as [T, ...T[]], { error: message }),
  );

/** Full wizard form model (all steps combined; each step validates its slice). */
export const lotFormSchema = z
  .object({
    title: z
      .string({ error: 'عنوان الزامی است' })
      .trim()
      .min(LOT_TITLE_MIN, `عنوان باید حداقل ${formatFaDigits(LOT_TITLE_MIN)} نویسه باشد`)
      .max(LOT_TITLE_MAX, `عنوان حداکثر ${formatFaDigits(LOT_TITLE_MAX)} نویسه است`),
    description: z
      .string({ error: 'توضیحات الزامی است' })
      .trim()
      .min(1, 'توضیحات الزامی است')
      .max(LOT_DESCRIPTION_MAX, `توضیحات حداکثر ${formatFaDigits(LOT_DESCRIPTION_MAX)} نویسه است`),
    categoryId: z.string({ error: 'دسته‌بندی الزامی است' }).min(1, 'دسته‌بندی الزامی است'),
    // Optional — empty string means "no subcategory".
    subcategoryId: z.string().optional(),
    quantity: z
      .number({ error: 'تعداد الزامی است' })
      .int('تعداد باید عدد صحیح باشد')
      .min(1, 'تعداد باید حداقل ۱ باشد'),
    unit: enumField(LOT_UNITS, 'واحد را انتخاب کنید'),
    // Optional — defaults to quantity server-side (LOT-002).
    availableQuantity: z
      .number({ error: 'موجودی قابل فروش نامعتبر است' })
      .int('موجودی قابل فروش باید عدد صحیح باشد')
      .min(0, 'موجودی قابل فروش نمی‌تواند منفی باشد')
      .optional(),
    // Optional — defaults to 1 server-side (LOT-002).
    minOrderQuantity: z
      .number({ error: 'حداقل سفارش نامعتبر است' })
      .int('حداقل سفارش باید عدد صحیح باشد')
      .min(1, 'حداقل سفارش باید حداقل ۱ باشد')
      .optional(),
    pricingType: enumField(PRICING_TYPES, 'نوع قیمت‌گذاری را انتخاب کنید'),
    totalPrice: z
      .number({ error: 'قیمت کل الزامی است' })
      .int('قیمت باید عدد صحیح تومان باشد')
      .min(1, 'قیمت کل باید بیش از صفر باشد')
      .max(LOT_MAX_TOTAL_PRICE, 'قیمت کل حداکثر ۲٬۰۰۰٬۰۰۰٬۰۰۰ تومان است'),
    condition: enumField(LOT_CONDITIONS, 'وضعیت کالا را انتخاب کنید'),
    liquidationReason: enumField(LIQUIDATION_REASONS, 'دلیل این فروش را انتخاب کنید'),
    province: z.string({ error: 'استان الزامی است' }).min(1, 'استان الزامی است'),
    city: z.string({ error: 'شهر الزامی است' }).min(1, 'شهر الزامی است'),
    // Optional free text — empty string means "not provided".
    locationHint: z
      .string()
      .trim()
      .max(
        LOT_LOCATION_HINT_MAX,
        `موقعیت تقریبی حداکثر ${formatFaDigits(LOT_LOCATION_HINT_MAX)} نویسه است`,
      )
      .optional(),
    exactAddress: z
      .string()
      .trim()
      .max(
        LOT_EXACT_ADDRESS_MAX,
        `نشانی دقیق حداکثر ${formatFaDigits(LOT_EXACT_ADDRESS_MAX)} نویسه است`,
      )
      .optional(),
  })
  .superRefine((data, ctx) => {
    // 0 ≤ available ≤ quantity (API rule; wizard defaults available = quantity).
    if (data.availableQuantity !== undefined && data.availableQuantity > data.quantity) {
      ctx.addIssue({
        code: 'custom',
        path: ['availableQuantity'],
        message: 'موجودی قابل فروش نمی‌تواند بیشتر از کل تعداد باشد',
      });
    }
    // 1 ≤ minOrder ≤ quantity.
    if (data.minOrderQuantity !== undefined && data.minOrderQuantity > data.quantity) {
      ctx.addIssue({
        code: 'custom',
        path: ['minOrderQuantity'],
        message: 'حداقل سفارش نمی‌تواند بیشتر از کل تعداد باشد',
      });
    }
    // City must belong to the chosen province (static geo list — server rule).
    if (data.province && data.city && findIranCity(data.province, data.city) === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['city'],
        message: 'شهر انتخابی مربوط به این استان نیست',
      });
    }
  });

export type LotFormData = z.infer<typeof lotFormSchema>;

/** Per-step field names — a step is valid when its slice parses. */
export const STEP_FIELDS = {
  media: [],
  basics: ['title', 'description'],
  pricing: [
    'totalPrice',
    'quantity',
    'unit',
    'minOrderQuantity',
    'availableQuantity',
    'pricingType',
  ],
  classification: [
    'categoryId',
    'subcategoryId',
    'condition',
    'liquidationReason',
    'province',
    'city',
    'locationHint',
    'exactAddress',
  ],
  review: [],
} as const;

export type LotStepId = keyof typeof STEP_FIELDS;

export const STEP_ORDER: readonly LotStepId[] = [
  'media',
  'basics',
  'pricing',
  'classification',
  'review',
];

export const STEP_TITLES_FA: Record<LotStepId, string> = {
  media: 'تصاویر و ویدیو',
  basics: 'عنوان و توضیحات',
  pricing: 'قیمت و تعداد',
  classification: 'دسته‌بندی و محل',
  review: 'بازبینی و ارسال',
};

export const IRAN_PROVINCE_OPTIONS = IRAN_PROVINCES;

// --- edit-mode matrix (mirror of LotsService.update) ---
/**
 * Which wizard shape a lot's status allows:
 * - `create`: new lot (no status yet) — all five steps.
 * - `draft`: DRAFT/REJECTED — fully editable, media editable, autosave PATCH.
 * - `pricing`: ACTIVE/PAUSED — only totalPrice/quantity/minOrder/available.
 * - `readonly`: everything else — banner + read-only summary.
 */
export type LotWizardMode = 'create' | 'draft' | 'pricing' | 'readonly';

export function lotWizardMode(status: LotStatus | undefined): LotWizardMode {
  if (status === undefined) {
    return 'create';
  }
  if (status === 'DRAFT' || status === 'REJECTED') {
    return 'draft';
  }
  if (status === 'ACTIVE' || status === 'PAUSED') {
    return 'pricing';
  }
  return 'readonly';
}
