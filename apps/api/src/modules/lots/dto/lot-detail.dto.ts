import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  LiquidationReason,
  LotCondition,
  LotStatus,
  LotUnit,
  PricingType,
  type Category,
  type Lot,
} from '@prisma/client';
import { LotCardResponseDto } from './lot-card.dto';
import { LotMediaResponseDto, toLotMediaResponse, type LotMediaWithAsset } from './lot-media.dto';

/**
 * MKT-009 — the PUBLIC lot DETAIL shape served by `GET /lots/:code`. The
 * fourth allowlisted mapper of the lots module, tuned for the conversion
 * surface (full spec + gallery + seller summary + similar lots):
 *
 * - NEVER carries `exactAddress` / `rejectionReason` (plan R7 — released only
 *   to deal participants / owner view) and NO seller contact fields (the
 *   phone/email stay behind the chat/offers flows; the seller block has no
 *   identity beyond the public profile summary). Location is public per plan
 *   §3 but APPROXIMATE only: province/city + `locationHint`, never an address.
 * - `viewCount` is deliberately NOT in the payload (nothing on the page
 *   renders it; the counter exists for analytics/sorting later).
 * - `category`/`subcategory` are NAME rows ({id, nameFa, slug}) — the spec
 *   block and breadcrumbs render fa labels, so the API joins the Category rows
 *   instead of exposing bare ids.
 * - `seller.verified` is a HARD-CODED false placeholder until TRS-001/002
 *   (Phase 7) — same contract-slot strategy as the card's `verifiedSeller`.
 * - `similar` is composed by LotsService (repository `findSimilar`: up to 8
 *   newest ACTIVE lots of the same subcategory, backfilled from the parent
 *   category, excluding self) and mapped with the MKT-001 card mapper.
 * - `status` is always ACTIVE on this endpoint (non-ACTIVE codes answer 404);
 *   the field stays in the contract so the web renders the lifecycle slot
 *   without a later breaking change.
 */

/** The seller summary joined by the repository detail include (structurally — fakes qualify). */
export type LotDetailSellerRow = {
  id: string;
  name: string;
  profile: { businessName: string | null; city: string | null } | null;
};

/** Name-row shape of category/subcategory (the include's select). */
export type LotDetailCategoryRow = Pick<Category, 'id' | 'nameFa' | 'slug'>;

/** Repository row the detail mapper consumes: Lot + LOT_PUBLIC_DETAIL_INCLUDE (structurally — fakes qualify). */
export type LotDetailRow = Lot & {
  seller: LotDetailSellerRow;
  category: LotDetailCategoryRow;
  subcategory: LotDetailCategoryRow | null;
  media?: LotMediaWithAsset[];
};

export class LotDetailCategoryDto {
  @ApiProperty({ example: 'clx…cuid', description: 'Category id (stable key for links)' })
  id!: string;

  @ApiProperty({ example: 'پوشاک', description: 'Persian display name (primary label)' })
  nameFa!: string;

  @ApiProperty({ example: 'apparel', description: 'EN slug — /c/{slug} landing links' })
  slug!: string;
}

export class LotDetailSellerDto {
  @ApiProperty({ example: 'clx…cuid', description: 'Seller user id — links the public profile' })
  id!: string;

  @ApiProperty({ example: 'مینا رضایی', description: 'User.name — the person/fallback display' })
  name!: string;

  @ApiPropertyOptional({
    example: 'تولیدی پوشاک مینا',
    nullable: true,
    type: String,
    description: 'Profile.businessName — preferred display when set (businessName ?? name)',
  })
  businessName!: string | null;

  @ApiPropertyOptional({
    example: 'tehran',
    nullable: true,
    type: String,
    description: 'Profile.city slug — the seller business location (fa label resolved web-side)',
  })
  city!: string | null;

  @ApiProperty({
    example: false,
    description:
      'PLACEHOLDER — always false until TRS-001/002 land verification badges (Phase 7); the web hides the badge while false',
  })
  verified!: boolean;
}

export class LotPublicDetailResponseDto {
  @ApiProperty({
    example: 'clx…cuid',
    description: 'Internal id — client cache keys only, never in URLs',
  })
  id!: string;

  @ApiProperty({
    example: '7Kd2Qm9x',
    description:
      'Public, non-sequential URL id (nanoid-8 base62) — this endpoint addresses lots BY it',
    minLength: 8,
    maxLength: 8,
  })
  code!: string;

  @ApiProperty({ example: 'عمده پیراهن مردانه — ۵۰ عدد', minLength: 5, maxLength: 120 })
  title!: string;

  @ApiProperty({ example: 'توضیحات کامل کالا و شرایط فروش', maxLength: 5000 })
  description!: string;

  @ApiProperty({ example: 112_500_000, minimum: 1, maximum: 2_000_000_000 })
  totalPrice!: number;

  @ApiProperty({
    example: 2_250_000,
    description: 'Derived on write server-side: round(totalPrice / quantity)',
  })
  unitPrice!: number;

  @ApiProperty({ example: 50, minimum: 1 })
  quantity!: number;

  @ApiProperty({ example: 50, description: 'Remaining sellable amount (0 ≤ available ≤ quantity)' })
  availableQuantity!: number;

  @ApiProperty({
    example: 10,
    minimum: 1,
    description: 'Minimum order amount (1 ≤ min ≤ quantity)',
  })
  minOrderQuantity!: number;

  @ApiProperty({ enum: LotUnit, example: 'PIECE' })
  unit!: LotUnit;

  @ApiProperty({ enum: LotCondition, example: 'GRADE_A' })
  condition!: LotCondition;

  @ApiProperty({ enum: LiquidationReason, example: 'OVERSTOCK' })
  liquidationReason!: LiquidationReason;

  @ApiProperty({ enum: PricingType, example: 'NEGOTIABLE' })
  pricingType!: PricingType;

  @ApiProperty({
    enum: LotStatus,
    example: 'ACTIVE',
    description: 'Always ACTIVE on this endpoint (else 404)',
  })
  status!: LotStatus;

  @ApiProperty({ type: LotDetailCategoryDto, description: 'Category NAME row (fa label + slug)' })
  category!: LotDetailCategoryDto;

  @ApiPropertyOptional({
    type: LotDetailCategoryDto,
    nullable: true,
    description: 'Subcategory NAME row — null when the lot is filed at the top level',
  })
  subcategory!: LotDetailCategoryDto | null;

  @ApiProperty({ example: 'tehran', description: 'Province slug (static geo list)' })
  province!: string;

  @ApiProperty({ example: 'tehran', description: 'City slug (static geo list)' })
  city!: string;

  @ApiPropertyOptional({
    example: 'بازار بزرگ تهران',
    nullable: true,
    type: String,
    maxLength: 100,
    description: 'Approximate public area hint — never the address',
  })
  locationHint!: string | null;

  @ApiProperty({
    example: '2026-09-05T00:00:00.000Z',
    description: 'Listing expiry — the page is 404 once it passes',
  })
  expiresAt!: Date;

  @ApiProperty({ example: '2026-09-05T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-09-05T00:00:00.000Z' })
  updatedAt!: Date;

  @ApiProperty({
    type: LotDetailSellerDto,
    description: 'Public seller summary — NO contact fields',
  })
  seller!: LotDetailSellerDto;

  @ApiProperty({
    type: [LotMediaResponseDto],
    description: 'Ordered full gallery (MEDIA-005) — url + kind + isCover per entry',
  })
  media!: LotMediaResponseDto[];

  @ApiProperty({
    type: [LotCardResponseDto],
    description:
      'Up to 8 newest ACTIVE lots of the same subcategory (backfilled from the category), excluding this lot — MKT-001 card shapes',
  })
  similar!: LotCardResponseDto[];
}

/**
 * Allowlist mapper — copies ONLY the detail fields listed above. A new Lot
 * column must be added here explicitly to surface in the payload (nothing
 * leaks by default; the unit + e2e allowlist tests pin the exact key set).
 * `mediaBaseUrl` is the PUBLIC_MEDIA_BASE_URL resolved by the caller (service
 * boundary) so the mapper stays pure. `similar` is NOT mapped here — the
 * service composes it from repository card rows with `toLotCardResponse`.
 */
export function toLotPublicDetailResponse(
  lot: LotDetailRow,
  mediaBaseUrl: string,
): Omit<LotPublicDetailResponseDto, 'similar'> {
  return {
    id: lot.id,
    code: lot.code,
    title: lot.title,
    description: lot.description,
    totalPrice: lot.totalPrice,
    unitPrice: lot.unitPrice,
    quantity: lot.quantity,
    availableQuantity: lot.availableQuantity,
    minOrderQuantity: lot.minOrderQuantity,
    unit: lot.unit,
    condition: lot.condition,
    liquidationReason: lot.liquidationReason,
    pricingType: lot.pricingType,
    status: lot.status,
    category: { ...lot.category },
    subcategory: lot.subcategory ? { ...lot.subcategory } : null,
    province: lot.province,
    city: lot.city,
    locationHint: lot.locationHint,
    expiresAt: lot.expiresAt,
    createdAt: lot.createdAt,
    updatedAt: lot.updatedAt,
    seller: {
      id: lot.seller.id,
      name: lot.seller.name,
      businessName: lot.seller.profile?.businessName ?? null,
      city: lot.seller.profile?.city ?? null,
      // TRS-001/002 placeholder — see the class doc; never compute a real value here.
      verified: false,
    },
    // Public content — ordered by the repository include; `[]` for rows read
    // without the gallery.
    media: toLotMediaResponse(lot.media ?? [], mediaBaseUrl),
  };
}
