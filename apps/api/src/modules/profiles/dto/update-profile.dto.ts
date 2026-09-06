import { ApiPropertyOptional } from '@nestjs/swagger';
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
import {
  INSTAGRAM_HANDLE_REGEX,
  MAX_PROFILE_INTERESTS,
  SELLER_BUSINESS_TYPES,
  type SellerBusinessType,
} from './save-onboarding.dto';

/**
 * `PATCH /profiles/me` body — partial-update semantics: absent fields are left
 * untouched (unlike the full-replace PUT onboarding), an explicit `null` clears
 * an optional field. Field rules mirror ONB-001 (displayName 3–60 when present,
 * businessName ≤80 with required-if-seller checked against the RESULTING
 * profile, province+city as a validated geo pair, instagram handle, website
 * URL, ≤10 active interests). Cross-field rules live in ProfilesService.
 *
 * Role flags are ADD-ONLY (PROF-001 card: "role changes allowed — adds
 * accountRole, never removes history"): `true` grants the hat; `false` never
 * removes an existing one (rejected with 400 — re-submitting onboarding is the
 * role-change path).
 */
export class UpdateProfileDto {
  @ApiPropertyOptional({
    example: true,
    description: 'Grant the buyer hat (add-only; false never removes it)',
    nullable: true,
    type: Boolean,
  })
  @IsOptional()
  @IsBoolean()
  isBuyer?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'Grant the seller hat (add-only; false never removes it)',
    nullable: true,
    type: Boolean,
  })
  @IsOptional()
  @IsBoolean()
  isSeller?: boolean;

  @ApiPropertyOptional({ example: 'مینا رضایی', minLength: 3, maxLength: 60, nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  displayName?: string;

  @ApiPropertyOptional({
    example: 'تولیدی پوشاک مینا',
    maxLength: 80,
    nullable: true,
    type: String,
    description: 'Required on the resulting profile while the seller hat is held',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  businessName?: string | null;

  @ApiPropertyOptional({
    example: 'isfahan',
    nullable: true,
    type: String,
    description: 'Province slug — must be sent together with city (both-or-neither)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  province?: string | null;

  @ApiPropertyOptional({
    example: 'kashan',
    nullable: true,
    type: String,
    description: 'City slug; the resulting (province, city) pair is geo-validated',
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
    description: 'Instagram handle (username only, no URL); null clears it',
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
    description: 'Website URL; null clears it',
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
    description: 'Replaces the whole interest set when present (null clears all)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PROFILE_INTERESTS)
  @ArrayUnique()
  @IsString({ each: true })
  interests?: string[] | null;
}
