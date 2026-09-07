import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { LOT_CARD_SORTS, type LotCardSort } from '../lots.constants';

/**
 * MKT-001 — query params for the public listing GET /lots.
 *
 * MKT-002 will ADD the filter params to this class (it owns the file's
 * filter half); MKT-001 ships pagination + sort only.
 *
 * `sort` overrides the shared DTO's `field:asc|desc` grammar with the card's
 * SINGLE-TOKEN allowlist (LOT_CARD_SORTS): every token is a buyer-facing sort
 * with a FIXED direction (`expiresAt` = ending-soon asc, `createdAt` =
 * newest desc…), so direction is not client-addressable — an unknown or
 * decorated token (`priceAsc:desc`) is a 400, keeping future sorts additive
 * exactly as the card demands. The inherited page/limit caps apply unchanged
 * (limit ≤ 100 → 400).
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
}
