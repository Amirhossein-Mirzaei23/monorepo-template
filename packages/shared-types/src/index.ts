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
// --- conversations / messages (CHT-003; CHT-004 embeds it in WS payloads) ---
export type MessageResponseDto = components['schemas']['MessageResponseDto'];
/** The backwards-cursor history envelope of GET /conversations/:id/messages (CHT-003). */
export type MessagePageDto = components['schemas']['MessagePageDto'];
/** POST /conversations/:id/read response — { readCount } (CHT-003). */
export type MarkConversationReadResponseDto =
  components['schemas']['MarkConversationReadResponseDto'];
// --- conversations inbox (CHT-002/005) ---
export type ConversationResponseDto = components['schemas']['ConversationResponseDto'];
export type ConversationLotSummaryDto = components['schemas']['ConversationLotSummaryDto'];
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
// --- offers (OFR-002; consumed by the OFR-004 offers UI) ---
export type OfferLotSummaryDto = components['schemas']['OfferLotSummaryDto'];
export type OfferResponseDto = components['schemas']['OfferResponseDto'];
export type CreateOfferDto = components['schemas']['CreateOfferDto'];
export type CounterOfferDto = components['schemas']['CounterOfferDto'];
// --- profiles (MKT-004) ---
/** Public seller strip summary — `verified` is a hard false until TRS-001 (Phase 7). */
export type PublicSellerSummaryDto = components['schemas']['PublicSellerSummaryDto'];
/** Envelope of GET /profiles/sellers — a plain list, no pagination metadata. */
export type PublicSellerListDto = components['schemas']['PublicSellerListDto'];
// --- profiles (PROF-002 public seller page) ---
/** Trust metrics block — PROF-005 placeholders (zeros + nulls) on a public shape. */
export type SellerPublicMetricsDto = components['schemas']['SellerPublicMetricsDto'];
/** One distinct ACTIVE-lot category chip of the seller page. */
export type SellerPublicCategoryDto = components['schemas']['SellerPublicCategoryDto'];
/**
 * GET /profiles/sellers/:id payload. The generated type leaves the two
 * lot-page envelopes optional (inline-schema quirk) — recompose with them
 * REQUIRED since the runtime payload always carries both.
 */
export type PublicSellerProfileDto = Omit<
  components['schemas']['PublicSellerProfileDto'],
  'activeLots' | 'soldLots'
> & {
  activeLots: Paginated<LotCardResponseDto>;
  soldLots: Paginated<LotCardResponseDto>;
};
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
// --- conversations inbox (CHT-002) ---
export const conversationResponseSchema = apiSchemas.ConversationResponseDto;
// --- messages (CHT-003; consumed by the CHT-006 thread through the BFF) ---
export const sendMessageSchema = apiSchemas.SendMessageDto;
export const messageResponseSchema = apiSchemas.MessageResponseDto;
export const messagePageSchema = apiSchemas.MessagePageDto;
export const markConversationReadResponseSchema = apiSchemas.MarkConversationReadResponseDto;
export const conversationLotSummarySchema = apiSchemas.ConversationLotSummaryDto;
/** Conversation status — derived from the generated schema (compile-time synced). */
export const conversationStatusSchema = conversationResponseSchema.shape.status;
/**
 * GET /conversations items (CHT-002). The controller documents the response as
 * `Paginated<ConversationListItemDto>` INLINE (description-only `@ApiOkResponse`
 * — no `type:`), so the swagger document carries no named
 * `ConversationListItemDto` schema and there is nothing generated to recompose;
 * this mirror hand-writes the DTO fields
 * (apps/api/src/modules/conversations/dto/conversation-list.dto.ts) with the
 * status enum derived from the generated ConversationResponseDto. Contract
 * drift fails loudly at parse time (`parseApiResponse`), like every card.
 */
export const conversationCounterpartSchema = zod.object({
  id: zod.string(),
  name: zod.string(),
  /** Placeholder — always null until user avatars exist (MEDIA/TRS follow-up). */
  avatarUrl: zod.string().nullable(),
  /** TRS-001 placeholder — hard false until Phase 7; the badge stays hidden. */
  verified: zod.boolean(),
});
export const conversationListItemSchema = zod.object({
  id: zod.string(),
  status: conversationStatusSchema,
  /** Newest-message stamp — the inbox sort key (ISO datetime over the wire). */
  lastMessageAt: zod.iso.datetime(),
  lastMessagePreview: zod.string().nullable(),
  isLastMessageSystem: zod.boolean(),
  lot: conversationLotSummarySchema,
  counterpart: conversationCounterpartSchema,
  myUnreadCount: zod.number(),
  role: zod.enum(['buyer', 'seller']),
});
export type ConversationCounterpartDto = zod.infer<typeof conversationCounterpartSchema>;
export type ConversationListItemDto = zod.infer<typeof conversationListItemSchema>;
export type ConversationStatus = zod.infer<typeof conversationStatusSchema>;
export type ConversationRole = ConversationListItemDto['role'];
/** The GET /conversations envelope — Paginated<ConversationListItemDto>. */
export const conversationsPageSchema = zod.object({
  items: zod.array(conversationListItemSchema),
  total: zod.number(),
  page: zod.number(),
  limit: zod.number(),
});
// --- profiles (PROF-002) ---
/**
 * The same Nest quirks as the detail payload hit the seller page: `metrics`
 * serializes as a lossy `z.object({})`, and the two lot-page envelopes embed
 * the lossy generated card schema (plus a spurious `.optional()`). Recompose
 * metrics/categories/pages from the real shapes so the runtime schema
 * validates and KEEPS what the TS contract (PublicSellerProfileDto) promises.
 */
const sellerLotCardPageSchema = zod.object({
  items: zod.array(lotCardResponseSchema),
  total: zod.number(),
  page: zod.number(),
  limit: zod.number(),
});
export const sellerPublicMetricsSchema = apiSchemas.SellerPublicMetricsDto;
export const sellerPublicCategorySchema = apiSchemas.SellerPublicCategoryDto;
export const publicSellerProfileSchema = apiSchemas.PublicSellerProfileDto.extend({
  metrics: apiSchemas.SellerPublicMetricsDto,
  activeLots: sellerLotCardPageSchema,
  soldLots: sellerLotCardPageSchema,
});

// --- offers (OFR-002) ---
/**
 * The same Nest nested-object quirk as `metrics`/`seller` above: the generated
 * `OfferResponseDto.lot` serializes as a lossy `z.object({})` that would strip
 * the lot summary on parse. Recompose the real shape (apiSchemas.OfferLotSummaryDto)
 * so the runtime schema validates and KEEPS what the TS contract
 * (OfferResponseDto['lot']) already promises.
 */
export const offerLotSummarySchema = apiSchemas.OfferLotSummaryDto;
export const offerResponseSchema = apiSchemas.OfferResponseDto.extend({
  lot: offerLotSummarySchema,
});
/** Offer status — derived from the generated schema (compile-time synced). */
export const offerStatusSchema = offerResponseSchema.shape.status;
export type OfferStatus = OfferResponseDto['status'];
/** The caller's side of an offer, resolved server-side (`myRole`). */
export type OfferMyRole = OfferResponseDto['myRole'];
/** The GET /offers and GET /lots/:lotId/offers envelope — Paginated<OfferResponseDto>. */
export const offersPageSchema = zod.object({
  items: zod.array(offerResponseSchema),
  total: zod.number(),
  page: zod.number(),
  limit: zod.number(),
});
export const createOfferSchema = apiSchemas.CreateOfferDto;
export const counterOfferSchema = apiSchemas.CounterOfferDto;

// --- Deals (DEAL-002/003/004) ---

/** Deal payloads (DEAL-002) — the recomposed lot summary, the SAME nested-object
 * quirk as the offers schema above: the generated `DealResponseDto.lot`
 * serializes as a lossy `z.object({})` that would strip the block on parse. */
export const dealLotSummarySchema = apiSchemas.DealLotSummaryDto;
export const dealResponseSchema = apiSchemas.DealResponseDto.extend({
  lot: dealLotSummarySchema,
});
export type DealResponseDto = components['schemas']['DealResponseDto'];
export type DealStatus = components['schemas']['DealResponseDto']['status'];
/** The caller's side of a deal, resolved server-side (`myRole`). */
export type DealMyRole = components['schemas']['DealResponseDto']['myRole'];
/** One timeline entry of the deal detail (DEAL-004). */
export const dealEventViewSchema = apiSchemas.DealEventViewDto;
/** GET /deals/:code — the deal plus its audit timeline. */
export const dealDetailResponseSchema = apiSchemas.DealDetailResponseDto.extend({
  lot: dealLotSummarySchema,
});
export type DealDetailResponseDto = components['schemas']['DealDetailResponseDto'];
export type DealEventViewDto = components['schemas']['DealEventViewDto'];
/** POST /deals/:code/transition body (DEAL-003). */
export type TransitionDealDto = components['schemas']['TransitionDealDto'];
/** The GET /deals envelope — Paginated<DealResponseDto>. */
export const dealsPageSchema = zod.object({
  items: zod.array(dealResponseSchema),
  total: zod.number(),
  page: zod.number(),
  limit: zod.number(),
});

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
