import { z } from 'zod';
import {
  adminUserDetailSchema,
  adminUsersListResponseSchema,
  type AdminUserDetailDto,
  type AdminUserListItemDto,
  type AdminUsersListResponseDto,
} from '@monorepo/shared-types';

/**
 * Runtime contract of the /admin/users surface (admin panel Task 05) — the
 * response schemas are GENERATED from the API's swagger document
 * (`npm run gen:types`) and recomposed here (the joined `profile` summary is
 * the Nest allOf quirk — see shared-types index). Contract drift fails loudly
 * at parse time (`parseApiResponse` in the api layer).
 */
export const adminUsersListSchema = adminUsersListResponseSchema;
export const adminUserDetailResponseSchema = adminUserDetailSchema;
export type AdminUsersListData = AdminUsersListResponseDto;
export type AdminUserDetailData = AdminUserDetailDto;
export type AdminUserListItem = AdminUserListItemDto;

/** The URL-driven filter state of the users list (?q/&role/&status/&accountRole/&onboarded/&page). */
export const adminUsersFiltersSchema = z.object({
  q: z.string().max(100).optional(),
  role: z.enum(['USER', 'ADMIN']).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'BLOCKED', 'DELETED']).optional(),
  accountRole: z.enum(['BUYER', 'SELLER']).optional(),
  onboarded: z.boolean().optional(),
  page: z.number().int().min(1).optional(),
});

export type AdminUsersFilters = z.infer<typeof adminUsersFiltersSchema>;

/** Persian label maps — exhaustive per enum (deal-schema precedent). */
export const USER_STATUS_LABELS_FA: Record<AdminUserListItem['status'], string> = {
  ACTIVE: 'فعال',
  SUSPENDED: 'تعلیق‌شده',
  BLOCKED: 'مسدود',
  DELETED: 'حذف‌شده',
};

export const USER_ROLE_LABELS_FA: Record<AdminUserListItem['role'], string> = {
  USER: 'کاربر',
  ADMIN: 'مدیر',
};

export const ACCOUNT_ROLE_LABELS_FA: Record<AdminUserListItem['accountRoles'][number], string> = {
  BUYER: 'خریدار',
  SELLER: 'فروشنده',
};

/** The one-shot status actions (API transition table lives in the service). */
export const USER_STATUS_ACTION_LABELS_FA = {
  SUSPEND: 'تعلیق',
  BLOCK: 'مسدودسازی',
  ACTIVATE: 'فعال‌سازی',
  DELETE: 'حذف',
} as const;
