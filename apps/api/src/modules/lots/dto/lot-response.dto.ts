import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  LiquidationReason,
  LotCondition,
  LotStatus,
  LotUnit,
  PricingType,
  type Lot,
} from '@prisma/client';

/**
 * Lot response shapes (LOT-002) — TWO allowlisted mappers from the repository
 * row, per plan R7 privacy:
 *
 * - `LotPublicResponseDto`: the future MKT browse/detail shape. NEVER carries
 *   `exactAddress` (released only inside a deal) or `rejectionReason`
 *   (moderation verdict is owner business) — the mapper copies by allowlist.
 * - `LotOwnerResponseDto`: adds the two private fields for the seller's own
 *   view. THIS task's endpoints are owner-scoped and return this shape; the
 *   public mapper ships now so MKT cards consume the same contract.
 *
 * Enum-valued fields are the raw Prisma values — Persian labels live in
 * `lots.constants.ts` and are resolved web-side (never hardcoded in components).
 * province/city are geo slugs (iran-geo list), resolved client-side like profiles.
 */
export class LotPublicResponseDto {
  @ApiProperty({ example: 'clx…cuid', description: 'Internal id — stays internal to the API' })
  id!: string;

  @ApiProperty({
    example: '7Kd2Qm9x',
    description: 'Public, non-sequential URL id (nanoid-8 base62)',
    minLength: 8,
    maxLength: 8,
  })
  code!: string;

  @ApiProperty({ example: 'clx…cuid', description: 'Seller user id — links the public profile' })
  sellerId!: string;

  @ApiProperty({ example: 'clx…cuid' })
  categoryId!: string;

  @ApiPropertyOptional({ example: 'clx…cuid', nullable: true, type: String })
  subcategoryId!: string | null;

  @ApiProperty({ example: 'عمده پیراهن مردانه — ۵۰ عدد', minLength: 5, maxLength: 120 })
  title!: string;

  @ApiProperty({ example: 'توضیحات کامل کالا و شرایط فروش', maxLength: 5000 })
  description!: string;

  @ApiProperty({ example: 50, minimum: 1 })
  quantity!: number;

  @ApiProperty({ enum: LotUnit, example: 'PIECE' })
  unit!: LotUnit;

  @ApiProperty({ example: 50, description: 'Remaining sellable amount (0 ≤ available ≤ quantity)' })
  availableQuantity!: number;

  @ApiProperty({
    example: 10,
    minimum: 1,
    description: 'Minimum order amount (1 ≤ min ≤ quantity)',
  })
  minOrderQuantity!: number;

  @ApiProperty({ enum: PricingType, example: 'NEGOTIABLE' })
  pricingType!: PricingType;

  @ApiProperty({ example: 112_500_000, minimum: 1, maximum: 2_000_000_000 })
  totalPrice!: number;

  @ApiProperty({
    example: 2_250_000,
    description: 'Derived on write server-side: round(totalPrice / quantity)',
  })
  unitPrice!: number;

  @ApiProperty({ enum: LotCondition, example: 'GRADE_A' })
  condition!: LotCondition;

  @ApiProperty({ enum: LiquidationReason, example: 'OVERSTOCK' })
  liquidationReason!: LiquidationReason;

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

  @ApiProperty({ enum: LotStatus, example: 'DRAFT' })
  status!: LotStatus;

  @ApiProperty({ example: 0 })
  viewCount!: number;

  @ApiProperty({ example: 0 })
  saveCount!: number;

  @ApiProperty({
    example: '2026-10-05T00:00:00.000Z',
    description: 'Listing expiry (+30d at create/submit)',
  })
  expiresAt!: Date;

  @ApiPropertyOptional({
    example: null,
    nullable: true,
    type: Date,
    description: 'Set when moderation publishes the lot (admin flow)',
  })
  publishedAt!: Date | null;

  @ApiPropertyOptional({ example: null, nullable: true, type: Date })
  soldAt!: Date | null;

  @ApiPropertyOptional({ example: null, nullable: true, type: Date })
  featuredAt!: Date | null;

  @ApiProperty({ example: '2026-09-05T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-09-05T00:00:00.000Z' })
  updatedAt!: Date;
}

/**
 * Owner shape (seller's own view) — the public fields PLUS the two private
 * ones: `exactAddress` (only ever released to deal participants otherwise) and
 * `rejectionReason` (the moderation verdict the seller must see to fix + resubmit).
 */
export class LotOwnerResponseDto extends LotPublicResponseDto {
  @ApiPropertyOptional({
    example: 'تهران، خیابان …، پلاک ۱۲',
    nullable: true,
    type: String,
    maxLength: 300,
    description: 'PRIVATE — owner view only; never in public payloads (plan R7)',
  })
  exactAddress!: string | null;

  @ApiPropertyOptional({
    example: 'عکس‌ها کیفیت کافی ندارند',
    nullable: true,
    type: String,
    description: 'Moderation verdict — owner view only; cleared on resubmit',
  })
  rejectionReason!: string | null;
}

/**
 * Allowlist mapper — copies ONLY the listed public fields. A new Lot column
 * must be added here explicitly to surface in any response (nothing leaks by
 * default, which is what the e2e allowlist test locks in).
 * Accepts both the repository row and structurally identical fakes.
 */
export function toLotPublicResponse(lot: Lot): LotPublicResponseDto {
  return {
    id: lot.id,
    code: lot.code,
    sellerId: lot.sellerId,
    categoryId: lot.categoryId,
    subcategoryId: lot.subcategoryId,
    title: lot.title,
    description: lot.description,
    quantity: lot.quantity,
    unit: lot.unit,
    availableQuantity: lot.availableQuantity,
    minOrderQuantity: lot.minOrderQuantity,
    pricingType: lot.pricingType,
    totalPrice: lot.totalPrice,
    unitPrice: lot.unitPrice,
    condition: lot.condition,
    liquidationReason: lot.liquidationReason,
    province: lot.province,
    city: lot.city,
    locationHint: lot.locationHint,
    status: lot.status,
    viewCount: lot.viewCount,
    saveCount: lot.saveCount,
    expiresAt: lot.expiresAt,
    publishedAt: lot.publishedAt,
    soldAt: lot.soldAt,
    featuredAt: lot.featuredAt,
    createdAt: lot.createdAt,
    updatedAt: lot.updatedAt,
  };
}

/** Owner mapper: public allowlist + the two private fields (and nothing else). */
export function toLotOwnerResponse(lot: Lot): LotOwnerResponseDto {
  return {
    ...toLotPublicResponse(lot),
    exactAddress: lot.exactAddress,
    rejectionReason: lot.rejectionReason,
  };
}
