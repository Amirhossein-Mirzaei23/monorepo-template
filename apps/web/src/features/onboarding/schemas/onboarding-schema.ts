/**
 * Client-side onboarding form schema (ONB-002) — mirrors the API's
 * SaveOnboardingDto rules (apps/api/src/modules/profiles/dto/save-onboarding.dto.ts)
 * with Persian messages. Field-level shapes are intentionally hand-written:
 * the generated schema is used for response parsing, while this one drives the
 * wizard UX (cross-field rules, per-step validation, fa messages).
 */
import { z } from 'zod';
import { IRAN_PROVINCES, findIranCity } from '@/lib/iran-geo';

export const INSTAGRAM_HANDLE_REGEX = '^[a-zA-Z0-9._]{1,30}$';

export const SELLER_BUSINESS_TYPE_LABELS_FA = {
  MANUFACTURER: 'تولیدکننده',
  WORKSHOP: 'کارگاهی',
  WHOLESALER: 'عمده‌فروش',
  RETAILER: 'خرده‌فروش',
  TRADING: 'بازرگانی',
  SERVICE: 'خدماتی',
  OTHER: 'سایر',
} as const;

const displayName = z
  .string({ error: 'نام نمایشی الزامی است' })
  .trim()
  .min(3, 'نام نمایشی باید حداقل ۳ نویسه باشد')
  .max(60, 'نام نمایشی حداکثر ۶۰ نویسه است');

const interests = z
  .array(z.string(), { error: 'دسته‌بندی‌ها نامعتبر هستند' })
  .max(10, 'حداکثر ۱۰ علاقه‌مندی می‌توانید انتخاب کنید');

/** Full wizard form model (all steps combined; each step validates its slice). */
export const onboardingFormSchema = z
  .object({
    isBuyer: z.boolean(),
    isSeller: z.boolean(),
    displayName,
    businessName: z.string().trim().max(80).optional(),
    province: z.string().optional(),
    city: z.string().optional(),
    // Optional link fields: an empty string means "not provided".
    instagram: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z
        .string()
        .trim()
        .regex(/^[a-zA-Z0-9._]{1,30}$/, 'آیدی اینستاگرام باید ۱ تا ۳۰ نویسه لاتین باشد')
        .optional(),
    ),
    website: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().trim().url('نشانی وب‌سایت معتبر نیست').optional(),
    ),
    sellerYearsActive: z.number().int().min(0).max(99).optional(),
    sellerBusinessType: z
      .enum(['MANUFACTURER', 'WORKSHOP', 'WHOLESALER', 'RETAILER', 'TRADING', 'SERVICE', 'OTHER'])
      .optional(),
    sellerDescription: z.string().trim().max(2000, 'توضیحات حداکثر ۲۰۰۰ نویسه است').optional(),
    interests,
  })
  .superRefine((data, ctx) => {
    if (!data.isBuyer && !data.isSeller) {
      ctx.addIssue({
        code: 'custom',
        path: ['isBuyer'],
        message: 'حداقل یکی از نقش‌های خریدار یا فروشنده را انتخاب کنید',
      });
    }
    if (data.isSeller && (!data.businessName || data.businessName.length === 0)) {
      ctx.addIssue({
        code: 'custom',
        path: ['businessName'],
        message: 'نام کسب‌وکار برای فروشندگان الزامی است',
      });
    }
    if (data.province !== undefined || data.city !== undefined) {
      // Both-or-neither + pair check against the static geo list (server rule).
      if (!data.province || !data.city) {
        ctx.addIssue({
          code: 'custom',
          path: ['city'],
          message: 'استان و شهر را با هم انتخاب کنید',
        });
      } else if (findIranCity(data.province, data.city) === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['city'],
          message: 'شهر انتخابی مربوط به این استان نیست',
        });
      }
    }
  });

export type OnboardingFormData = z.infer<typeof onboardingFormSchema>;

/** Per-step field names — a step is valid when its slice parses. */
export const STEP_FIELDS = {
  role: ['isBuyer', 'isSeller'],
  identity: ['displayName', 'businessName', 'province', 'city'],
  interests: ['interests'],
  sellerExtras: ['sellerYearsActive', 'sellerBusinessType', 'sellerDescription'],
  links: ['instagram', 'website'],
} as const;

export type OnboardingStepId = keyof typeof STEP_FIELDS;

export const SELLER_BUSINESS_TYPES = Object.keys(SELLER_BUSINESS_TYPE_LABELS_FA) as Array<
  keyof typeof SELLER_BUSINESS_TYPE_LABELS_FA
>;

export const IRAN_PROVINCE_OPTIONS = IRAN_PROVINCES;
