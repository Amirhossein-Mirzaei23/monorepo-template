import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { SELLERS_DEFAULT_LIMIT, SELLERS_MAX_LIMIT } from './public-seller.dto';

/**
 * MKT-004 — query params of the public sellers listing GET /profiles/sellers.
 *
 * - `verified` is OPTIONAL boolean (the home strip always sends `true`).
 *   While seller verification does not exist (TRS-001, Phase 7) every seller
 *   maps to `verified: false`, so `verified=true` legitimately returns an
 *   empty list and the strip stays hidden — see toPublicSellerSummary.
 * - `limit` is capped at SELLERS_MAX_LIMIT (20) — a discovery strip, not a
 *   directory; there is deliberately NO pagination envelope (plain
 *   { items } — the callers ask for a fixed top slice).
 */
export class ListSellersQueryDto {
  @ApiPropertyOptional({
    description:
      'When true, only verified sellers — an empty list until TRS-001 lands verification (Phase 7)',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') {
      return true;
    }
    if (value === 'false') {
      return false;
    }
    return value;
  })
  @IsBoolean()
  verified?: boolean;

  @ApiPropertyOptional({
    default: SELLERS_DEFAULT_LIMIT,
    minimum: 1,
    maximum: SELLERS_MAX_LIMIT,
    description: `Page size of the strip — 1..${SELLERS_MAX_LIMIT}, default ${SELLERS_DEFAULT_LIMIT}`,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SELLERS_MAX_LIMIT)
  limit: number = SELLERS_DEFAULT_LIMIT;
}
