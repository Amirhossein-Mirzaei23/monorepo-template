import { BadRequestException } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

/** Standard list-endpoint envelope (list endpoints always paginate). */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

const SORT_PATTERN = /^[a-zA-Z]+(?::(asc|desc))?$/;

/**
 * Shared pagination/sort query DTO — extend per domain to add filters.
 * Sort syntax: `field` (asc) or `field:desc`.
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({ example: 'createdAt:desc', pattern: SORT_PATTERN.source })
  @IsOptional()
  @IsString()
  @Matches(SORT_PATTERN, { message: 'sort must be `field` or `field:asc|desc`' })
  sort?: string;
}

export interface ParsedSort<TField extends string> {
  field: TField;
  order: 'asc' | 'desc';
}

/** Parses the `sort` query param against an allowlist of domain fields. */
export function parseSort<TField extends string>(
  sort: string | undefined,
  allowedFields: readonly TField[],
  defaultSort: ParsedSort<TField>,
): ParsedSort<TField> {
  if (!sort) {
    return defaultSort;
  }
  const [field, order] = sort.split(':') as [TField, 'asc' | 'desc' | undefined];
  if (!allowedFields.includes(field)) {
    throw new BadRequestException(`sort must be one of: ${allowedFields.join(', ')}`);
  }
  return { field, order: order ?? 'asc' };
}
