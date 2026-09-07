import { ApiProperty, ApiPropertyOptional, getSchemaPath } from '@nestjs/swagger';
import type { Profile, User } from '@prisma/client';
import { findIranCity, findIranProvince } from '../../../common/constants/iran-geo';
import type { Paginated } from '../../../common/dto/pagination-query.dto';
import { LotCardResponseDto } from '../../lots/dto/lot-card.dto';

/**
 * PROF-002 — the PUBLIC seller profile payload (GET /profiles/sellers/:id).
 * The trust surface buyers vet sellers on, and the strictest profile read:
 *
 * - Allowlist mapper (`toPublicSellerProfile`) — exactly the fields below,
 *   never a spread. No `User.phone`/`email` (they are not even columns of the
 *   profile row the endpoint reads), no `instagram`/`website` (seller extras
 *   stay off the public payload), no `sellerDescription`/`sellerBusinessType`
 *   (own-profile detail), and no lot privacy fields (the nested pages reuse
 *   the MKT-001 card mapper, which never carries exactAddress — the e2e
 *   allowlist test pins all of this).
 * - `id` is the PROFILE id — the same id space as the MKT-004 sellers strip
 *   (`GET /profiles/sellers`) and the public URL `/s/{id}`.
 * - `province`/`city` carry PERSIAN DISPLAY NAMES resolved server-side via the
 *   shared iran-geo list — a documented divergence from the slug convention of
 *   the strip/lot payloads: this payload is display-only (no filtering, no
 *   links key off it), so the page renders the labels without a second
 *   resolution hop. An unresolvable slug falls back to the raw stored value.
 * - `verified`/`badges` are the TRS-001/TRS-002 placeholders (hard false/[])
 *   so the page layout exists before Phase 7 without a later contract change.
 * - `metrics` are the PROF-005 placeholders (zeros + nulls — the PROF-001
 *   metrics pattern on a public shape). Key names follow the PROF-002 card
 *   briefing (`ratingAverage`, not PROF-001's `averageRating`); PROF-005 will
 *   unify both shapes when real values land.
 * - `activeLots`/`soldLots` are Paginated MKT-001 card envelopes (page 1):
 *   active = ACTIVE/visibility-core, limit 12; sold = SOLD, newest soldAt,
 *   limit 4. There is no «view all» contract — more history arrives with the
 *   seller-filtered browse (later card), so the page stays single-fetch.
 */

/**
 * Swagger fragment for a `Paginated<LotCardResponseDto>` field — the envelope
 * has no named wrapper class (MKT-001 annotates it inline on the route), so
 * the two page fields embed the same inline object schema with a $ref to the
 * card. The strict ApiPropertyOptions object-form union demands
 * `additionalProperties`, which the real envelope does not semantically carry —
 * `false` is the honest value anyway (fixed 4-key envelope).
 */
const LOT_CARD_PAGE_SCHEMA = {
  type: 'object' as const,
  additionalProperties: false as const,
  required: ['items', 'total', 'page', 'limit'],
  properties: {
    items: { type: 'array' as const, items: { $ref: getSchemaPath(LotCardResponseDto) } },
    total: { type: 'integer' as const },
    page: { type: 'integer' as const },
    limit: { type: 'integer' as const },
  },
};

/** Read-side page sizes of the public seller page (PROF-002): active grid + sold strip. */
export const SELLER_PROFILE_ACTIVE_LIMIT = 12;
export const SELLER_PROFILE_SOLD_LIMIT = 4;

/** One distinct category of the seller's ACTIVE lots (name row for chips). */
export class SellerPublicCategoryDto {
  @ApiProperty({ example: 'clx…cuid', description: 'Category id (stable key)' })
  id!: string;

  @ApiProperty({ example: 'پوشاک', description: 'Persian display name' })
  nameFa!: string;

  @ApiProperty({ example: 'apparel', description: 'EN slug (kebab-case)' })
  slug!: string;
}

/**
 * Trust metrics block — PROF-005 placeholders only (the page renders «—» for
 * the nullable pair and zeros for the counters until the rollup job lands).
 */
export class SellerPublicMetricsDto {
  @ApiProperty({
    example: 0,
    description: 'PLACEHOLDER (0) until PROF-005 computes successful deals',
  })
  successfulTransactions!: number;

  @ApiProperty({
    example: null,
    nullable: true,
    type: Number,
    description: 'PLACEHOLDER (null) until REV-001/002 + PROF-005 land ratings',
  })
  ratingAverage!: number | null;

  @ApiProperty({ example: 0, description: 'PLACEHOLDER (0) until reviews exist' })
  ratingCount!: number;

  @ApiProperty({
    example: null,
    nullable: true,
    type: Number,
    description: 'Median first-reply minutes — PLACEHOLDER (null) until PROF-005',
  })
  responseRateMinutes!: number | null;

  @ApiProperty({
    example: 0,
    description: 'Cancellation rate (0–100) — PLACEHOLDER (0) until PROF-005',
  })
  cancellationRate!: number;
}

export class PublicSellerProfileDto {
  @ApiProperty({
    example: 'clx…cuid',
    description:
      'Profile id — same id space as GET /profiles/sellers (MKT-004) and the /s/{id} URL',
  })
  id!: string;

  @ApiProperty({ example: 'مینا رضایی' })
  displayName!: string;

  @ApiPropertyOptional({
    example: 'تولیدی پوشاک مینا',
    nullable: true,
    type: String,
    description: 'Preferred display name when set (page header: businessName ?? displayName)',
  })
  businessName!: string | null;

  @ApiPropertyOptional({
    example: 'عمده‌فروشی پوشاک با ۱۰ سال سابقه',
    nullable: true,
    type: String,
    description: 'Public business description (Profile.bio) — the only about text on the page',
  })
  bio!: string | null;

  @ApiPropertyOptional({
    example: 'اصفهان',
    nullable: true,
    type: String,
    description:
      'fa PROVINCE LABEL resolved server-side via iran-geo (display-only — diverges from the slug convention of filterable payloads by design)',
  })
  province!: string | null;

  @ApiPropertyOptional({
    example: 'کاشان',
    nullable: true,
    type: String,
    description: 'fa CITY LABEL resolved server-side via iran-geo (see province note)',
  })
  city!: string | null;

  @ApiProperty({
    example: false,
    description: 'TRS-001 placeholder — hard false until seller verification exists (Phase 7)',
  })
  verified!: boolean;

  @ApiProperty({
    type: String,
    isArray: true,
    description: 'TRS-002 placeholder — always [] until trust badges land (Phase 7)',
  })
  badges!: string[];

  @ApiProperty({
    type: SellerPublicMetricsDto,
    description: 'Trust metrics — PROF-005 placeholders',
  })
  metrics!: SellerPublicMetricsDto;

  @ApiProperty({
    example: '2026-01-01T00:00:00.000Z',
    description: 'User.createdAt — «member since» (rendered Jalali)',
  })
  memberSince!: Date;

  @ApiProperty({
    type: SellerPublicCategoryDto,
    isArray: true,
    description:
      'Distinct categories of the seller’s visible ACTIVE lots — count desc, then nameFa; [] for a seller without lots',
  })
  categories!: SellerPublicCategoryDto[];

  @ApiProperty({
    ...LOT_CARD_PAGE_SCHEMA,
    description: 'Page 1 (limit 12) of the seller’s visible ACTIVE lots as MKT-001 cards',
  })
  activeLots!: Paginated<LotCardResponseDto>;

  @ApiProperty({
    ...LOT_CARD_PAGE_SCHEMA,
    description: 'Up to 4 SOLD lots, newest soldAt first, as MKT-001 cards («فروش‌های موفق»)',
  })
  soldLots!: Paginated<LotCardResponseDto>;
}

/** Profile fields the public payload reads (allowlist input of the mapper). */
export type SellerProfilePublicRow = Pick<
  Profile,
  'id' | 'displayName' | 'businessName' | 'bio' | 'province' | 'city'
>;

/** User fields the public payload reads (only the membership date). */
export type SellerPublicUserRow = Pick<User, 'createdAt'>;

/**
 * Allowlist mapper — copies ONLY the payload fields above. Every nested block
 * is built here explicitly (metrics/zeros, badges/[], location labels), so a
 * new Profile/User/Lot column can never surface by default. `categories` and
 * the two card pages are composed by the service (lot rows map through the
 * lots module's own card mapper) and arrive ready to embed.
 */
export function toPublicSellerProfile(
  profile: SellerProfilePublicRow,
  user: SellerPublicUserRow,
  categories: SellerPublicCategoryDto[],
  activeLots: Paginated<LotCardResponseDto>,
  soldLots: Paginated<LotCardResponseDto>,
): PublicSellerProfileDto {
  const provinceFa = profile.province
    ? (findIranProvince(profile.province)?.nameFa ?? profile.province)
    : null;
  const cityFa = profile.city
    ? (findIranCity(profile.province ?? '', profile.city)?.nameFa ?? profile.city)
    : null;
  return {
    id: profile.id,
    displayName: profile.displayName,
    businessName: profile.businessName,
    bio: profile.bio,
    province: provinceFa,
    city: cityFa,
    // TRS-001 placeholder — see the class doc; never compute a real value here.
    verified: false,
    // TRS-002 placeholder — the badge model does not exist yet (Phase 7).
    badges: [],
    metrics: {
      // PROF-005 placeholders — the rollup job owns the real values later.
      successfulTransactions: 0,
      ratingAverage: null,
      ratingCount: 0,
      responseRateMinutes: null,
      cancellationRate: 0,
    },
    memberSince: user.createdAt,
    categories,
    activeLots,
    soldLots,
  };
}
