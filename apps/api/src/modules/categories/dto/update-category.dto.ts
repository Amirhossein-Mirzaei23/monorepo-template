import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { CATEGORY_SLUG_REGEX } from './create-category.dto';

/**
 * Payload for PATCH /admin/categories/:id (CAT-004). Every field is
 * independent — omitted fields stay untouched. `sortOrder` is deliberately
 * NOT patchable: sibling ordering goes through POST /admin/categories/:id/reorder
 * (sibling sortOrder swap), the card's only ordering mechanism.
 */
export class UpdateCategoryDto {
  @ApiPropertyOptional({ example: 'پوشاک', minLength: 2, maxLength: 50 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  nameFa?: string;

  @ApiPropertyOptional({ example: 'Apparel', nullable: true, type: String, maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  nameEn?: string | null;

  @ApiPropertyOptional({
    example: 'apparel',
    pattern: CATEGORY_SLUG_REGEX.source,
    maxLength: 100,
    description: 'Clashing with another category → 409',
  })
  @IsOptional()
  @IsString()
  @Matches(CATEGORY_SLUG_REGEX, {
    message: 'slug must be kebab-case: lowercase letters/digits joined by single hyphens',
  })
  @MaxLength(100)
  slug?: string;

  @ApiPropertyOptional({
    example: 'clx…cuid',
    nullable: true,
    type: String,
    description:
      'Re-parent target — must reference a TOP-LEVEL category (moving a parent under a parent → 400); null = move to top level',
  })
  @IsOptional()
  @IsString()
  parentId?: string | null;

  @ApiPropertyOptional({
    example: false,
    description:
      'Deactivate = hide from the public tree; lots keep referencing the row (no cascade)',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
