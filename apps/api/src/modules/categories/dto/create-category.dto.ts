import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Hand-rolled kebab-case slug validation (no slug library — CAT-001
 * constraint): lowercase letters/digits, single hyphens, no leading/trailing
 * hyphen, no consecutive hyphens.
 */
export const CATEGORY_SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Payload for creating a category — wired to POST /admin/categories by CAT-004. */
export class CreateCategoryDto {
  @ApiProperty({ example: 'پوشاک', minLength: 2, maxLength: 50 })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  nameFa!: string;

  @ApiPropertyOptional({ example: 'Apparel', nullable: true, type: String, maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  nameEn?: string | null;

  @ApiProperty({ example: 'apparel', pattern: CATEGORY_SLUG_REGEX.source, maxLength: 100 })
  @IsString()
  @Matches(CATEGORY_SLUG_REGEX, {
    message: 'slug must be kebab-case: lowercase letters/digits joined by single hyphens',
  })
  @MaxLength(100)
  slug!: string;

  @ApiPropertyOptional({
    example: 'clx…cuid',
    nullable: true,
    type: String,
    description:
      'Parent category id — must reference a top-level category (depth ≤ 2); omit/null = top-level',
  })
  @IsOptional()
  @IsString()
  parentId?: string | null;

  @ApiPropertyOptional({
    example: 1,
    minimum: 0,
    description:
      'Position among siblings — omit to append after the last existing sibling (max sibling sortOrder + 1, 0 for the first sibling)',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
