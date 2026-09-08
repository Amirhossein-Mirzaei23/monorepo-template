import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { OFFER_MAX_UNIT_PRICE, OFFER_NOTE_MAX_LENGTH } from '../offers.constants';

/**
 * `POST /offers/:id/counter` body (OFR-002) — the seller's answer terms. The
 * child offer NEVER mutates the countered row (immutable negotiation
 * history); this payload becomes a NEW PENDING offer linked through
 * parentId, inheriting lot/buyer/conversation from the parent and its own
 * fresh 72 h expiry. The same lot-relative rules apply, re-validated against
 * the CURRENT lot row (stale quantity → 409 QUANTITY_OUT_OF_RANGE).
 */
export class CounterOfferDto {
  @ApiProperty({
    example: 500,
    minimum: 1,
    description:
      'Countered piece count — re-validated against the CURRENT lot bounds (409 when stale)',
  })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiProperty({
    example: 330_000,
    minimum: 1,
    maximum: OFFER_MAX_UNIT_PRICE,
    description: 'Countered per-unit Toman price (1..2B integer) — totalPrice derived server-side',
  })
  @IsInt()
  @Min(1)
  @Max(OFFER_MAX_UNIT_PRICE)
  unitPrice!: number;

  @ApiPropertyOptional({
    example: 'با این قیمت موافقم ولی تعداد کمتر',
    maxLength: OFFER_NOTE_MAX_LENGTH,
    description: `Optional free-text note — ≤ ${OFFER_NOTE_MAX_LENGTH} characters (code points, service-checked)`,
  })
  @IsOptional()
  @IsString()
  @Length(0, OFFER_NOTE_MAX_LENGTH)
  note?: string;
}
