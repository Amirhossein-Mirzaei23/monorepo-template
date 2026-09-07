/**
 * Public API of @monorepo/shared-types — the single shared contract package.
 *
 * Everything in `./generated` is produced from the NestJS swagger schema
 * (`npm run gen:types`). Never hand-edit generated files: change the API DTOs
 * and regenerate. CI fails the build when generated files drift.
 */
import type { z } from 'zod';
import type { components } from './generated/schema';
import { apiSchemas } from './generated/schema.zod';

// `z` is needed as a VALUE for the recomposed schemas below (z.array).
import { z as zod } from 'zod';

// --- entity types (mirror of the API DTOs) ---
export type UserResponseDto = components['schemas']['UserResponseDto'];
export type CreateUserDto = components['schemas']['CreateUserDto'];
export type UpdateUserDto = components['schemas']['UpdateUserDto'];
export type LoginDto = components['schemas']['LoginDto'];
export type LoginResponseDto = components['schemas']['LoginResponseDto'];
export type OtpRequestDto = components['schemas']['OtpRequestDto'];
export type OtpRequestResponseDto = components['schemas']['OtpRequestResponseDto'];
export type OtpVerifyDto = components['schemas']['OtpVerifyDto'];
export type OtpVerifyResponseDto = components['schemas']['OtpVerifyResponseDto'];
export type MeResponseDto = components['schemas']['MeResponseDto'];
export type SaveOnboardingDto = components['schemas']['SaveOnboardingDto'];
export type ProfileResponseDto = components['schemas']['ProfileResponseDto'];
export type UpdateProfileDto = components['schemas']['UpdateProfileDto'];
/** Read-only trust metrics block on ProfileResponseDto (placeholders until P1). */
export type ProfileMetricsDto = ProfileResponseDto['metrics'];
export type CategoryTreeNodeDto = components['schemas']['CategoryTreeNodeDto'];
// --- media (MEDIA-002/003) ---
export type MediaUploadUrlsDto = components['schemas']['MediaUploadUrlsDto'];
export type MediaUploadResponseDto = components['schemas']['MediaUploadResponseDto'];
export type MediaVideoUploadUrlsDto = components['schemas']['MediaVideoUploadUrlsDto'];
export type MediaVideoUploadResponseDto = components['schemas']['MediaVideoUploadResponseDto'];
// --- lots (LOT-002) ---
export type CreateLotDto = components['schemas']['CreateLotDto'];
export type UpdateLotDto = components['schemas']['UpdateLotDto'];
export type LotPublicResponseDto = components['schemas']['LotPublicResponseDto'];
/** Owner shape — the only one carrying exactAddress/rejectionReason (plan R7). */
export type LotOwnerResponseDto = components['schemas']['LotOwnerResponseDto'];
/** PUT /lots/:id/media body — the complete ordered gallery (MEDIA-005). */
export type PutLotMediaDto = components['schemas']['PutLotMediaDto'];
// --- lot card (MKT-001) ---
/** The public CARD payload — the atomic shape of every list surface (MKT-005). */
export type LotCardResponseDto = components['schemas']['LotCardResponseDto'];
/** Minimal seller summary embedded in the card (display precedence: businessName ?? name). */
export type LotCardSellerDto = components['schemas']['LotCardSellerDto'];
// --- lot detail (MKT-009) ---
/** Public DETAIL payload of GET /lots/{code} — full spec + gallery + seller block + similar. */
export type LotPublicDetailResponseDto = components['schemas']['LotPublicDetailResponseDto'];
/** Public seller block on the detail page (`verified` is a TRS-001 hard-false placeholder). */
export type LotDetailSellerDto = components['schemas']['LotDetailSellerDto'];
/** Category NAME row (fa label + slug) for the detail spec block. */
export type LotDetailCategoryDto = components['schemas']['LotDetailCategoryDto'];
// --- profiles (MKT-004) ---
/** Public seller strip summary — `verified` is a hard false until TRS-001 (Phase 7). */
export type PublicSellerSummaryDto = components['schemas']['PublicSellerSummaryDto'];
/** Envelope of GET /profiles/sellers — a plain list, no pagination metadata. */
export type PublicSellerListDto = components['schemas']['PublicSellerListDto'];
export type LotStatus = LotPublicResponseDto['status'];
export type LotUnit = LotPublicResponseDto['unit'];
export type LotCondition = LotPublicResponseDto['condition'];
export type LiquidationReason = LotPublicResponseDto['liquidationReason'];
export type PricingType = LotPublicResponseDto['pricingType'];
/** The API inlines the role enum into its DTOs; derive it from the user shape. */
export type UserRole = UserResponseDto['role'];
export type UserStatus = UserResponseDto['status'];
export type AccountRole = UserResponseDto['accountRoles'][number];
/** Closed seller-business-type allowlist (profile DTO; plain string in the DB). */
export type SellerBusinessType = NonNullable<SaveOnboardingDto['sellerBusinessType']>;

// --- runtime validation schemas (zod, generated from the same document) ---
export const userResponseSchema = apiSchemas.UserResponseDto;
export const userRoleSchema = userResponseSchema.shape.role;
export const createUserSchema = apiSchemas.CreateUserDto;
export const updateUserSchema = apiSchemas.UpdateUserDto;
export const loginSchema = apiSchemas.LoginDto;
export const loginResponseSchema = apiSchemas.LoginResponseDto;
export const otpRequestSchema = apiSchemas.OtpRequestDto;
export const otpRequestResponseSchema = apiSchemas.OtpRequestResponseDto;
export const otpVerifySchema = apiSchemas.OtpVerifyDto;
export const otpVerifyResponseSchema = apiSchemas.OtpVerifyResponseDto;
export const meResponseSchema = apiSchemas.MeResponseDto;
export const saveOnboardingSchema = apiSchemas.SaveOnboardingDto;
/**
 * The API serializes the `metrics` block as `allOf: [{$ref: ProfileMetricsDto}]`
 * (Nest inheritance quirk), which the zod generator — it has no `allOf` branch —
 * renders as a lossy `z.object({})`. Recompose the real metric fields so the
 * runtime schema validates what the TS contract (ProfileResponseDto['metrics'])
 * already promises.
 */
export const profileResponseSchema = apiSchemas.ProfileResponseDto.extend({
  metrics: apiSchemas.ProfileMetricsDto,
});
export const updateProfileSchema = apiSchemas.UpdateProfileDto;
export const categoryTreeNodeSchema = apiSchemas.CategoryTreeNodeDto;
// --- lots (LOT-002) ---
/** Owner response shape — every lot write/read the web makes returns it. */
export const lotOwnerResponseSchema = apiSchemas.LotOwnerResponseDto;
export const lotMediaResponseSchema = apiSchemas.LotMediaResponseDto;
export const putLotMediaSchema = apiSchemas.PutLotMediaDto;
/**
 * Same Nest quirk as `metrics` above: the card's `seller` block serializes as
 * `allOf: [{$ref: LotCardSellerDto}]`, so the generated schema renders it as a
 * lossy `z.object({})` that would silently strip the seller fields on parse.
 * Recompose the real seller shape so the runtime schema validates (and keeps)
 * what the TS contract (LotCardResponseDto['seller']) already promises.
 */
export const lotCardResponseSchema = apiSchemas.LotCardResponseDto.extend({
  seller: apiSchemas.LotCardSellerDto,
});
// --- lot detail (MKT-009) ---
/**
 * The same Nest allOf quirk hits EVERY nested-object field of the detail
 * payload (`seller`, `category`, `subcategory`), and `similar` references the
 * lossy generated card schema — recompose all of them (reusing the card/media
 * schemas above) so the runtime schema validates and KEEPS the fields the TS
 * contract already promises.
 */
export const lotDetailSellerSchema = apiSchemas.LotDetailSellerDto;
export const lotDetailCategorySchema = apiSchemas.LotDetailCategoryDto;
export const lotPublicDetailResponseSchema = apiSchemas.LotPublicDetailResponseDto.extend({
  seller: apiSchemas.LotDetailSellerDto,
  category: apiSchemas.LotDetailCategoryDto,
  subcategory: apiSchemas.LotDetailCategoryDto.nullable(),
  media: zod.array(lotMediaResponseSchema),
  similar: zod.array(lotCardResponseSchema),
});
// --- profiles (MKT-004) ---
export const publicSellerSummarySchema = apiSchemas.PublicSellerSummaryDto;
export const publicSellerListSchema = apiSchemas.PublicSellerListDto;

// --- shared helpers ---

/** Standard list-endpoint envelope (mirrors the API's Paginated<T>). */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

/** Uniform API error body (GlobalExceptionFilter). */
export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  /** Machine-readable error code (e.g. `TOO_MANY_REQUESTS`, `ACCOUNT_SUSPENDED`). */
  code?: string;
  /** Present on 429s — retry hint in seconds, mirrored in the Retry-After header. */
  retryAfterSeconds?: number;
  requestId?: string;
  timestamp?: string;
}

/** Parse an API response body against a generated schema, with a fallback message. */
export function parseApiResponse<T>(schema: z.ZodType<T>, payload: unknown, what: string): T {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new Error(`Invalid ${what} payload received from the API (contract drift?)`);
  }
  return result.data;
}
