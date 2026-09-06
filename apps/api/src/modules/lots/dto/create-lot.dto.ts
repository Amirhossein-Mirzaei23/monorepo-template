import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
 * `POST /lots` body (LOT-002). Per-field guards live here; cross-field rules
 * are LotsService's (subcategory child-of-category, minOrder/available vs
 * quantity, geo pair, title 5–120 counted in CODE POINTS — the fa-aware rule).
 *
 * Deliberate choices, documented:
 * - `submit: boolean` (default false) picks the entry status: false → DRAFT,
 *   true → PENDING_REVIEW. One flag beats duplicating the lifecycle enum in
 *   the body and lets the client accidentally publish nothing.
 * - `unitPrice` is NOT accepted — it is derived server-side as
 *   `round(totalPrice / quantity)`; the global pipe (forbidNonWhitelisted)
 *   rejects any client attempt with 400.
 * - `availableQuantity` defaults to `quantity`; `minOrderQuantity` defaults
 *   to 1; `unit` defaults to PIECE (mirrors the schema default).
 */
export class CreateLotDto {
  @ApiProperty({
    example: 'عمده پیراهن مردانه — ۵۰ عدد',
    minLength: LOT_TITLE_MIN_CODEPOINTS,
    maxLength: LOT_TITLE_MAX_CODEPOINTS,
    description: '5–120, counted in Unicode code points (fa-aware) — enforced in LotsService',
  })
  // Coarse UTF-16 guards; the authoritative code-point rule is in the service
  // (surrogate pairs make .length diverge from the visible character count).
  @IsString()
  @MinLength(LOT_TITLE_MIN_CODEPOINTS)
  @MaxLength(LOT_TITLE_MAX_CODEPOINTS * 2)
  title!: string;

  @ApiProperty({ example: 'توضیحات کامل کالا، جنس و شرایط فروش', maxLength: LOT_DESCRIPTION_MAX })
  @IsString()
  @MaxLength(LOT_DESCRIPTION_MAX)
  description!: string;

  @ApiProperty({ example: 'clx…cuid', description: 'Existing ACTIVE category id' })
  @IsString()
  categoryId!: string;

  @ApiPropertyOptional({
    example: 'clx…cuid',
    nullable: true,
    type: String,
    description: 'Optional — must be a DIRECT CHILD of categoryId (service rule)',
  })
  @IsOptional()
  @IsString()
  subcategoryId?: string | null;

  @ApiProperty({ example: 50, minimum: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({
    example: 50,
    minimum: 0,
    type: Number,
    description: 'Defaults to quantity; must stay within 0..quantity (service rule)',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  availableQuantity?: number;

  @ApiPropertyOptional({
    example: 10,
    minimum: 1,
    type: Number,
    description: 'Defaults to 1; must stay within 1..quantity (service rule)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  minOrderQuantity?: number;

  @ApiPropertyOptional({ enum: LotUnit, default: 'PIECE' })
  @IsOptional()
  @IsEnum(LotUnit)
  unit?: LotUnit;

  @ApiProperty({
    example: 112_500_000,
    minimum: LOT_MIN_TOTAL_PRICE,
    maximum: LOT_MAX_TOTAL_PRICE,
    description: 'Whole Toman — unitPrice is derived from this and quantity, never accepted',
  })
  @IsInt()
  @Min(LOT_MIN_TOTAL_PRICE)
  @Max(LOT_MAX_TOTAL_PRICE)
  totalPrice!: number;

  @ApiProperty({ enum: PricingType })
  @IsEnum(PricingType)
  pricingType!: PricingType;

  @ApiProperty({ enum: LotCondition })
  @IsEnum(LotCondition)
  condition!: LotCondition;

  @ApiProperty({ enum: LiquidationReason })
  @IsEnum(LiquidationReason)
  liquidationReason!: LiquidationReason;

  @ApiProperty({ example: 'tehran', description: 'Province slug — must pair with city (geo list)' })
  @IsString()
  @MaxLength(100)
  province!: string;

  @ApiProperty({ example: 'tehran', description: 'City slug — must belong to province (geo list)' })
  @IsString()
  @MaxLength(100)
  city!: string;

  @ApiPropertyOptional({
    example: 'بازار بزرگ تهران',
    nullable: true,
    type: String,
    maxLength: LOT_LOCATION_HINT_MAX,
    description: 'Approximate PUBLIC area hint — never the address',
  })
  @IsOptional()
  @IsString()
  @MaxLength(LOT_LOCATION_HINT_MAX)
  locationHint?: string | null;

  @ApiPropertyOptional({
    example: 'تهران، خیابان …، پلاک ۱۲',
    nullable: true,
    type: String,
    maxLength: LOT_EXACT_ADDRESS_MAX,
    description: 'PRIVATE — owner-shape only, released publicly only after a deal (plan R7)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(LOT_EXACT_ADDRESS_MAX)
  exactAddress?: string | null;

  @ApiPropertyOptional({
    example: false,
    default: false,
    description: 'false (default) → save as DRAFT; true → submit for moderation (PENDING_REVIEW)',
  })
  @IsOptional()
  @IsBoolean()
  submit?: boolean;
}
