import { ApiPropertyOptional } from '@nestjs/swagger';
import { LiquidationReason, LotCondition, PricingType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import {
  LOT_CARD_SORTS,
  LOT_FILTER_MAX_PRICE,
  LOT_FILTER_MAX_QUANTITY,
  LOT_LISTED_WITHIN_OPTIONS,
  type LotCardSort,
  type LotListedWithin,
} from '../lots.constants';

/**
 * Repeatable query params (`?condition=A&condition=B`) arrive as an array, but
 * a SINGLE value arrives as a bare scalar (express `qs` semantics) — normalize
 * scalar → `[scalar]` before the array validators run, so one selected chip
 * and several compose through the exact same path (MKT-002 "arrays allowed").
 */
const ToArray = () =>
  Transform(({ value }) =>
    Array.isArray(value) ? value : value === undefined ? undefined : [value],
  );

/**
 * MKT-001 + MKT-002 — query params for the public listing GET /lots.
 *
 * MKT-001 shipped pagination + sort; MKT-002 adds the buyer FILTER params
 * (this class owns the file's filter half). Contract decisions, documented:
 *
 * - `priceMin`/`priceMax` filter the DERIVED `unitPrice` (plan §12) — the one
 *   price buyers can compare across lots of different quantities, and the same
 *   field the `priceAsc`/`priceDesc` sorts use. Inclusive bounds, Toman ints.
 * - `qtyMin`/`qtyMax` filter `quantity` (the lot size), inclusive.
 * - Bounds: price ≤ 2,000,000,000 (the write-path money cap), qty ≤ 1,000,000,
 *   both ≥ 0 (card: "numeric ranges sane"). `priceMin > priceMax` is NOT a
 *   400 — the intersection is simply empty (card: "invalid combos
 *   ignored-safe, validated not crashed"); the DTO only guarantees sane
 *   per-field values.
 * - `city`/`province` are the iran-geo EN slugs (same stored keys as the write
 *   path). READ-side validation is FORMAT-ONLY (string ≤ 100, the write DTO's
 *   coarse guards): no geo-list lookup, no province↔city pairing on reads — an
 *   unknown-but-well-formed slug simply matches nothing, which is the card's
 *   ignored-safe behaviour, and saves a geo-list sync from breaking browsing.
 * - `condition[]`/`liquidationReason[]` are repeatable params with OR
 *   semantics (`?condition=GRADE_A&condition=NEW`); any unknown member → 400.
 * - `listedWithin` freshness: `7d`/`30d` → `createdAt >= now − 7/30 days`.
 *
 * DELIBERATELY ABSENT — `verifiedSeller`: the card header defers it to TRS-001
 * (Phase 7) — the LotVerification model and its approved
 * BUSINESS_VERIFIED/SELLER_VERIFIED rows do not exist yet, so there is no
 * EXISTS subquery to back the param. The global pipe forbids non-whitelisted
 * params, so sending `verifiedSeller=` today is an honest 400; the param and
 * its EXISTS arm land here with TRS-001 (the card payload already carries the
 * `verifiedSeller: false` placeholder from MKT-001).
 */
export class LotsPublicQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: LOT_CARD_SORTS,
    default: 'createdAt',
    description:
      'Full sort token with a fixed direction — createdAt (newest, default), updatedAt, priceAsc, priceDesc, quantityAsc, quantityDesc, expiresAt (ending soon)',
  })
  @IsOptional()
  @IsIn(LOT_CARD_SORTS as readonly string[], {
    message: 'sort must be one of: ' + LOT_CARD_SORTS.join(', '),
  })
  // Redeclared with an initializer on purpose: the base `sort` field:dir
  // grammar does not apply to this endpoint — the child decorators REPLACE the
  // accepted token set (class-validator still runs the base IsString/Matches
  // constraints too; every allowlisted token satisfies them).
  override sort?: LotCardSort = undefined;

  // --- MKT-002 filters ---

  @ApiPropertyOptional({
    example: 'clx…cuid',
    description: 'Category id — combined with subcategoryId when both are sent',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  categoryId?: string;

  @ApiPropertyOptional({
    example: 'clx…cuid',
    description: 'Subcategory id — narrows within categoryId when both are sent',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  subcategoryId?: string;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: LOT_FILTER_MAX_PRICE,
    description: `Inclusive min unitPrice (derived Toman) — 0..${LOT_FILTER_MAX_PRICE}; min > max is an empty result, not an error`,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(LOT_FILTER_MAX_PRICE)
  priceMin?: number;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: LOT_FILTER_MAX_PRICE,
    description: `Inclusive max unitPrice (derived Toman) — 0..${LOT_FILTER_MAX_PRICE}`,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(LOT_FILTER_MAX_PRICE)
  priceMax?: number;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: LOT_FILTER_MAX_QUANTITY,
    description: `Inclusive min quantity (lot size) — 0..${LOT_FILTER_MAX_QUANTITY}`,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(LOT_FILTER_MAX_QUANTITY)
  qtyMin?: number;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: LOT_FILTER_MAX_QUANTITY,
    description: `Inclusive max quantity (lot size) — 0..${LOT_FILTER_MAX_QUANTITY}`,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(LOT_FILTER_MAX_QUANTITY)
  qtyMax?: number;

  @ApiPropertyOptional({
    example: 'tehran',
    description:
      'City slug (iran-geo EN key) — format validated only; an unknown slug matches nothing',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({
    example: 'tehran',
    description:
      'Province slug (iran-geo EN key) — format validated only; an unknown slug matches nothing',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  province?: string;

  @ApiPropertyOptional({
    enum: LotCondition,
    isArray: true,
    description: 'Repeatable; OR semantics — lot condition is any of the sent values',
  })
  @IsOptional()
  @ToArray()
  @IsArray()
  @IsEnum(LotCondition, { each: true })
  condition?: LotCondition[];

  @ApiPropertyOptional({ enum: PricingType, description: 'FIXED | NEGOTIABLE' })
  @IsOptional()
  @IsEnum(PricingType)
  pricingType?: PricingType;

  @ApiPropertyOptional({
    enum: LiquidationReason,
    isArray: true,
    description: 'Repeatable; OR semantics — liquidation story is any of the sent values',
  })
  @IsOptional()
  @ToArray()
  @IsArray()
  @IsEnum(LiquidationReason, { each: true })
  liquidationReason?: LiquidationReason[];

  @ApiPropertyOptional({
    enum: LOT_LISTED_WITHIN_OPTIONS,
    description: 'Freshness — only lots created within the last 7 or 30 days',
  })
  @IsOptional()
  @IsIn(LOT_LISTED_WITHIN_OPTIONS as readonly string[], {
    message: 'listedWithin must be one of: ' + LOT_LISTED_WITHIN_OPTIONS.join(', '),
  })
  listedWithin?: LotListedWithin;
}
