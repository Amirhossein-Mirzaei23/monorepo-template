import { z } from 'zod';
import { adminCategoryTreeNodeSchema, type AdminCategoryTreeNodeDto } from '@monorepo/shared-types';

/**
 * Runtime contract of the /admin/categories surface (admin panel Task 06).
 * The tree schema is GENERATED from the API's swagger document
 * (`npm run gen:types`) and re-exported here — contract drift fails loudly at
 * parse time (`parseApiResponse` in the api layer). The form schema is
 * hand-written (the write payloads are form data) and mirrors the API DTOs
 * (nameFa 2-50, nameEn ≤ 50, kebab-case slug ≤ 100).
 */
export const adminCategoriesTreeSchema = z.array(adminCategoryTreeNodeSchema);
export type AdminCategoryTreeNode = AdminCategoryTreeNodeDto;

/** Same kebab-case rule the API enforces (CATEGORY_SLUG_REGEX, CAT-001). */
const CATEGORY_SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Shared create/edit form fields (fa/en/slug/parent). `nameEn` stays a plain
 * string in the form («» = absent) and is normalized to null on submit;
 * `parentId` uses '' as the top-level sentinel for the native select.
 */
export const categoryFormSchema = z.object({
  nameFa: z
    .string()
    .trim()
    .min(2, 'نام فارسی حداقل ۲ نویسه است')
    .max(50, 'نام فارسی حداکثر ۵۰ نویسه است'),
  nameEn: z.string().trim().max(50, 'نام انگلیسی حداکثر ۵۰ نویسه است'),
  slug: z
    .string()
    .trim()
    .min(1, 'اسلاگ الزامی است')
    .max(100, 'اسلاگ حداکثر ۱۰۰ نویسه است')
    .regex(
      CATEGORY_SLUG_REGEX,
      'اسلاگ باید به شکل kebab-case باشد: حروف کوچک انگلیسی و رقم با خط تیره تکی',
    ),
  parentId: z.string(),
});

export type CategoryFormData = z.infer<typeof categoryFormSchema>;

/** The write payload both create and edit submit (isActive goes through the toggle actions). */
export interface CategoryWritePayload {
  nameFa: string;
  nameEn: string | null;
  slug: string;
  parentId: string | null;
}

/** The server-side guard errors the editor maps to Persian copy. */
export const CATEGORY_GUARD_ERROR_COPY: Record<number, string> = {
  409: 'این اسلاگ قبلاً استفاده شده است؛ اسلاگ دیگری انتخاب کنید.',
  400: 'این تغییر با قواعد درخت دسته‌بندی (حداکثر دو سطح) سازگار نیست.',
};
