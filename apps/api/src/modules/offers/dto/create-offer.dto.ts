import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { OFFER_MAX_UNIT_PRICE, OFFER_NOTE_MAX_LENGTH } from '../offers.constants';

/**
 * `POST /offers` body (OFR-002) — the buyer-controlled terms of the
 * negotiation (the same shape every counter reuses server-side). Identity is
 * never body input: the buyer is the authenticated requester, the seller is
 * derived from the lot, totalPrice is derived on write. The DTO carries the
 * coarse per-field guards; the lot-relative rules (ACTIVE status,
 * minOrder..available, derived-totalPrice money ceiling) are business rules
 * the service enforces through validateOfferInput (OFR-001's shared validator)
 * with the proper 4xx codes.
 */
export class CreateOfferDto {
  @ApiProperty({
    example: 'clx…cuid',
    description:
      'The lot to offer on — must be ACTIVE (409 LOT_NOT_ACTIVE) and not the caller’s own (403 SELF_OFFER)',
  })
  @IsString()
  lotId!: string;

  @ApiProperty({
    example: 500,
    minimum: 1,
    description:
      'Offered piece count — validated against lot.minOrderQuantity..availableQuantity AT OFFER TIME (409 QUANTITY_OUT_OF_RANGE)',
  })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiProperty({
    example: 300_000,
    minimum: 1,
    maximum: OFFER_MAX_UNIT_PRICE,
    description:
      'Negotiated per-unit Toman price (1..2B, integer) — totalPrice is derived server-side (unitPrice × quantity) and shares the money ceiling',
  })
  @IsInt()
  @Min(1)
  @Max(OFFER_MAX_UNIT_PRICE)
  unitPrice!: number;

  @ApiPropertyOptional({
    example: 'لطفاً تا آخر هفته ارسال شود',
    maxLength: OFFER_NOTE_MAX_LENGTH,
    description: `Optional free-text note — ≤ ${OFFER_NOTE_MAX_LENGTH} characters (code points, service-checked); trimmed, empty → null`,
  })
  @IsOptional()
  @IsString()
  @Length(0, OFFER_NOTE_MAX_LENGTH)
  note?: string;

  @ApiPropertyOptional({
    example: 'clx…cuid',
    description:
      'Optional negotiation thread to post the ACTION message into — must exist AND be owned by the caller as the buyer (403 CONVERSATION_NOT_YOURS for unknown/foreign, uniform: no existence oracle) AND belong to the same lot (400 CONVERSATION_LOT_MISMATCH)',
  })
  @IsOptional()
  @IsString()
  conversationId?: string;
}
