/**
 * Client-side profile-edit form schema (PROF-001) — mirrors the API's
 * UpdateProfileDto rules (apps/api/src/modules/profiles/dto/update-profile.dto.ts)
 * with Persian messages, validated against the RESULTING profile state (the
 * form starts prefilled from GET /profiles/me). Same style as the onboarding
 * schema (ONB-002): hand-written zod for the form UX, generated schemas for
 * response parsing.
 */
import { z } from 'zod';
import type { ProfileResponseDto, UpdateProfileDto } from '@monorepo/shared-types';
import { findIranCity } from '@/lib/iran-geo';

const displayName = z
  .string({ error: 'نام نمایشی الزامی است' })
  .trim()
  .min(3, 'نام نمایشی باید حداقل ۳ نویسه باشد')
  .max(60, 'نام نمایشی حداکثر ۶۰ نویسه است');

const interests = z
  .array(z.string(), { error: 'دسته‌بندی‌ها نامعتبر هستند' })
  .max(10, 'حداکثر ۱۰ علاقه‌مندی می‌توانید انتخاب کنید');

/** Full settings-form model (strings for inputs; numbers converted on submit). */
export const profileFormSchema = z
  .object({
    isBuyer: z.boolean(),
    isSeller: z.boolean(),
    displayName,
    businessName: z.string().trim().max(80).optional(),
    province: z.string().optional(),
    city: z.string().optional(),
    bio: z.string().trim().max(500, 'درباره شما حداکثر ۵۰۰ نویسه است').optional(),
    // Optional link fields: an empty string means "not provided" (sent as null).
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
    sellerYearsActive: z.preprocess(
      (value) => (value === '' || value === undefined ? undefined : Number(value)),
      z
        .number({ error: 'سابقه فعالیت نامعتبر است' })
        .int('سابقه فعالیت باید عدد صحیح باشد')
        .min(0, 'سابقه فعالیت نمی‌تواند منفی باشد')
        .max(99, 'سابقه فعالیت حداکثر ۹۹ سال است')
        .optional(),
    ),
    sellerBusinessType: z
      .enum(['MANUFACTURER', 'WORKSHOP', 'WHOLESALER', 'RETAILER', 'TRADING', 'SERVICE', 'OTHER'])
      .optional(),
    sellerDescription: z.string().trim().max(2000, 'توضیحات حداکثر ۲۰۰۰ نویسه است').optional(),
    interests,
  })
  .superRefine((data, ctx) => {
    // Roles are add-only in the UI — the result can never be "no role", but the
    // schema guards the invariant anyway (server rejects removals with 400).
    if (!data.isBuyer && !data.isSeller) {
      ctx.addIssue({
        code: 'custom',
        path: ['isBuyer'],
        message: 'حداقل یکی از نقش‌های خریدار یا فروشنده لازم است',
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

export type ProfileFormData = z.infer<typeof profileFormSchema>;

/** Editable form state — inputs hold strings; roles reflect current OR added hats. */
export interface ProfileFormState {
  isBuyer: boolean;
  isSeller: boolean;
  displayName: string;
  businessName: string;
  province: string;
  city: string;
  bio: string;
  instagram: string;
  website: string;
  sellerYearsActive: string;
  sellerBusinessType: string;
  sellerDescription: string;
  interests: string[];
}

/** Prefill the form from the own-profile response (GET /profiles/me). */
export function toProfileFormState(profile: ProfileResponseDto): ProfileFormState {
  return {
    isBuyer: profile.isBuyer,
    isSeller: profile.isSeller,
    displayName: profile.displayName,
    businessName: profile.businessName ?? '',
    province: profile.province ?? '',
    city: profile.city ?? '',
    bio: profile.bio ?? '',
    instagram: profile.instagram ?? '',
    website: profile.website ?? '',
    sellerYearsActive: profile.sellerYearsActive !== null ? String(profile.sellerYearsActive) : '',
    sellerBusinessType: profile.sellerBusinessType ?? '',
    sellerDescription: profile.sellerDescription ?? '',
    interests: profile.interests.map((interest) => interest.id),
  };
}

/** Field errors of the first zod issue per field (inline messages). */
export type ProfileFieldErrors = Partial<Record<keyof ProfileFormState, string>>;

export function validateProfileForm(data: ProfileFormData): ProfileFieldErrors {
  const result = profileFormSchema.safeParse(data);
  if (result.success) {
    return {};
  }
  const errors: ProfileFieldErrors = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? '') as keyof ProfileFormState;
    if (!errors[field]) {
      errors[field] = issue.message;
    }
  }
  return errors;
}

/**
 * Build the PATCH payload from the form state. Roles are sent ONLY as
 * additions (`true`) — the API never removes a role by design ("adds
 * accountRole, never removes history"), so `false` is never put on the wire.
 */
export function toUpdatePayload(
  data: ProfileFormData,
  current: ProfileResponseDto,
): UpdateProfileDto {
  const payload: UpdateProfileDto = {
    displayName: data.displayName,
    businessName: data.businessName || null,
    bio: data.bio || null,
    instagram: data.instagram || null,
    website: data.website || null,
    interests: data.interests,
  };
  // Location is cleared as a whole (both-or-neither is validated above).
  if (data.province && data.city) {
    payload.province = data.province;
    payload.city = data.city;
  } else {
    payload.province = null;
    payload.city = null;
  }
  if (data.isBuyer && !current.isBuyer) {
    payload.isBuyer = true;
  }
  if (data.isSeller && !current.isSeller) {
    payload.isSeller = true;
  }
  if (data.isSeller) {
    payload.sellerYearsActive = data.sellerYearsActive ?? null;
    payload.sellerBusinessType = data.sellerBusinessType ?? null;
    payload.sellerDescription = data.sellerDescription || null;
  }
  return payload;
}
