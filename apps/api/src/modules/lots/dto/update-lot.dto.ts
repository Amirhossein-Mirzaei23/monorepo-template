import { ApiPropertyOptional } from '@nestjs/swagger';
import { LiquidationReason, LotCondition, LotUnit, PricingType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  LOT_DESCRIPTION_MAX,
  LOT_EXACT_ADDRESS_MAX,
  LOT_LOCATION_HINT_MAX,
  LOT_MAX_TOTAL_PRICE,
  LOT_MIN_TOTAL_PRICE,
  LOT_TITLE_MAX_CODEPOINTS,
  LOT_TITLE_MIN_CODEPOINTS,
} from '../lots.constants';

/**
 * `PATCH /lots/:id` body (LOT-002) — partial-update semantics: absent fields
 * stay untouched; an explicit `null` clears the nullable ones (subcategoryId,
 * locationHint, exactAddress). Field rules mirror CreateLotDto; cross-field
 * rules are checked against the RESULTING lot in LotsService.
 *
 * `submit: true` moves the lot to PENDING_REVIEW (from DRAFT or REJECTED —
 * resubmission clears rejectionReason) and refreshes expiresAt (+30d).
 *
 * Status gating is the service's job: DRAFT/REJECTED accept everything here;
 * ACTIVE/PAUSED only totalPrice/quantity/minOrderQuantity/availableQuantity
 * (any other key → 409 ILLEGAL_STATUS_EDIT); PENDING_REVIEW/SOLD/EXPIRED/
 * REMOVED reject PATCH outright. `unitPrice` is never accepted (derived).
 */
export class UpdateLotDto {
  @ApiPropertyOptional({
    example: 'عمده پیراهن مردانه — ۵۰ عدد',
    minLength: LOT_TITLE_MIN_CODEPOINTS,
    maxLength: LOT_TITLE_MAX_CODEPOINTS * 2,
    description: '5–120 code points (fa-aware); only while DRAFT/REJECTED',
  })
  @IsOptional()
  @IsString()
  @MinLength(LOT_TITLE_MIN_CODEPOINTS)
  @MaxLength(LOT_TITLE_MAX_CODEPOINTS * 2)
  title?: string;

  @ApiPropertyOptional({ example: 'توضیحات به‌روزشده', maxLength: LOT_DESCRIPTION_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(LOT_DESCRIPTION_MAX)
  description?: string;

  @ApiPropertyOptional({
    example: 'clx…cuid',
    description: 'Existing ACTIVE category; optional sub must stay its direct child',
  })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({
    example: 'clx…cuid',
    nullable: true,
    type: String,
    description: 'Direct child of the resulting categoryId; null clears it',
  })
  @IsOptional()
  @IsString()
  subcategoryId?: string | null;

  @ApiPropertyOptional({ example: 50, minimum: 1, type: Number })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiPropertyOptional({
    example: 45,
    minimum: 0,
    type: Number,
    description: 'Must stay within 0..(resulting quantity)',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  availableQuantity?: number;

  @ApiPropertyOptional({
    example: 10,
    minimum: 1,
    type: Number,
    description: 'Must stay within 1..(resulting quantity)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  minOrderQuantity?: number;

  @ApiPropertyOptional({ enum: LotUnit })
  @IsOptional()
  @IsEnum(LotUnit)
  unit?: LotUnit;

  @ApiPropertyOptional({
    example: 120_000_000,
    minimum: LOT_MIN_TOTAL_PRICE,
    maximum: LOT_MAX_TOTAL_PRICE,
    type: Number,
    description: 'Editable while ACTIVE/PAUSED — unitPrice re-derived, no re-moderation',
  })
  @IsOptional()
  @IsInt()
  @Min(LOT_MIN_TOTAL_PRICE)
  @Max(LOT_MAX_TOTAL_PRICE)
  totalPrice?: number;

  @ApiPropertyOptional({ enum: PricingType })
  @IsOptional()
  @IsEnum(PricingType)
  pricingType?: PricingType;

  @ApiPropertyOptional({ enum: LotCondition })
  @IsOptional()
  @IsEnum(LotCondition)
  condition?: LotCondition;

  @ApiPropertyOptional({ enum: LiquidationReason })
  @IsOptional()
  @IsEnum(LiquidationReason)
  liquidationReason?: LiquidationReason;

  @ApiPropertyOptional({
    example: 'alborz',
    description: 'The resulting (province, city) pair must be a valid geo pair',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  province?: string;

  @ApiPropertyOptional({ example: 'karaj', description: 'Must belong to the resulting province' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({
    example: 'میدان آزادگان',
    nullable: true,
    type: String,
    maxLength: LOT_LOCATION_HINT_MAX,
    description: 'Public area hint; null clears it',
  })
  @IsOptional()
  @IsString()
  @MaxLength(LOT_LOCATION_HINT_MAX)
  locationHint?: string | null;

  @ApiPropertyOptional({
    example: 'کرج، بلوار …',
    nullable: true,
    type: String,
    maxLength: LOT_EXACT_ADDRESS_MAX,
    description: 'PRIVATE (owner shape only); null clears it',
  })
  @IsOptional()
  @IsString()
  @MaxLength(LOT_EXACT_ADDRESS_MAX)
  exactAddress?: string | null;

  @ApiPropertyOptional({
    example: true,
    type: Boolean,
    description:
      'true → submit for moderation (DRAFT/REJECTED → PENDING_REVIEW; clears rejectionReason; refreshes expiresAt +30d)',
  })
  @IsOptional()
  @IsBoolean()
  submit?: boolean;
}
