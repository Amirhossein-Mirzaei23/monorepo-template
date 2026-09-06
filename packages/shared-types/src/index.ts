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
export type CategoryTreeNodeDto = components['schemas']['CategoryTreeNodeDto'];
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
export const profileResponseSchema = apiSchemas.ProfileResponseDto;
export const categoryTreeNodeSchema = apiSchemas.CategoryTreeNodeDto;

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
