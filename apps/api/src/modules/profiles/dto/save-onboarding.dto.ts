import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Closed allowlist for `Profile.sellerBusinessType` (plan §3 keeps it a plain
 * String in the DB, DTO-validated here so the list can grow without a
 * migration). Persian labels live in the web select (ONB-002).
 */
export const SELLER_BUSINESS_TYPES = [
  'MANUFACTURER',
  'WORKSHOP',
  'WHOLESALER',
  'RETAILER',
  'TRADING',
  'SERVICE',
  'OTHER',
] as const;
export type SellerBusinessType = (typeof SELLER_BUSINESS_TYPES)[number];

/** Instagram handle rule from the ONB-001 card. */
export const INSTAGRAM_HANDLE_REGEX = /^[a-zA-Z0-9._]{1,30}$/;

/** Max interests per profile (ONB-001 validation). */
export const MAX_PROFILE_INTERESTS = 10;

/**
 * `PUT /profiles/onboarding` body — full-replace semantics (PUT): omitted
 * optional fields are cleared. Cross-field rules live in ProfilesService:
 * ≥1 role, businessName required for sellers, province+city as a validated
 * geo pair, interests must reference active categories.
 */
export class SaveOnboardingDto {
  @ApiProperty({ example: true, description: 'Acts as a buyer (mirrors User.accountRoles)' })
  @IsBoolean()
  isBuyer!: boolean;

  @ApiProperty({ example: false, description: 'Acts as a seller (mirrors User.accountRoles)' })
  @IsBoolean()
  isSeller!: boolean;

  @ApiProperty({ example: 'مینا رضایی', minLength: 3, maxLength: 60 })
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  displayName!: string;

  @ApiPropertyOptional({
    example: 'تولیدی پوشاک مینا',
    maxLength: 80,
    nullable: true,
    type: String,
    description: 'Required when isSeller (service-level rule)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  businessName?: string | null;

  @ApiPropertyOptional({
    example: 'isfahan',
    nullable: true,
    type: String,
    description: 'Province slug from the static geo list — must be sent together with city',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  province?: string | null;

  @ApiPropertyOptional({
    example: 'kashan',
    nullable: true,
    type: String,
    description: 'City slug; validated against the province (pair check in ProfilesService)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string | null;

  @ApiPropertyOptional({
    example: 'خرید عمده پوشاک برای فروشگاه',
    maxLength: 500,
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string | null;

  @ApiPropertyOptional({
    example: 'mina.apparel',
    nullable: true,
    type: String,
    pattern: '^[a-zA-Z0-9._]{1,30}$',
    description: 'Instagram handle (username only, no URL)',
  })
  @IsOptional()
  @Matches(INSTAGRAM_HANDLE_REGEX, {
    message: 'instagram must be a valid handle: 1-30 chars of a-z A-Z 0-9 . _',
  })
  instagram?: string | null;

  @ApiPropertyOptional({
    example: 'https://mina-apparel.ir',
    nullable: true,
    type: String,
    format: 'url',
  })
  @IsOptional()
  @IsUrl({ require_tld: false })
  website?: string | null;

  @ApiPropertyOptional({ example: 6, minimum: 0, maximum: 99, nullable: true, type: Number })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(99)
  sellerYearsActive?: number | null;

  @ApiPropertyOptional({ enum: SELLER_BUSINESS_TYPES, nullable: true })
  @IsOptional()
  @IsIn(SELLER_BUSINESS_TYPES)
  sellerBusinessType?: SellerBusinessType | null;

  @ApiPropertyOptional({
    example: 'تولیدکننده پوشاک زنانه با ۶ سال سابقه صادرات',
    maxLength: 2000,
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  sellerDescription?: string | null;

  @ApiPropertyOptional({
    example: ['clx…cuid', 'clx…cuid'],
    maxItems: MAX_PROFILE_INTERESTS,
    uniqueItems: true,
    type: [String],
    description: 'Interest category ids (active categories only)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PROFILE_INTERESTS)
  @ArrayUnique()
  @IsString({ each: true })
  interests?: string[] | null;
}
