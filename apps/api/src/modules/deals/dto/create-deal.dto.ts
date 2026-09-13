import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeliveryMethod, PaymentMethodRecorded } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { DEAL_MAX_UNIT_PRICE, DEAL_NOTE_MAX_LENGTH } from '../deals.constants';

/**
 * `POST /deals` body (DEAL-002) — the deal CONFIRMATION payload. Identity and
 * context are never body input: the buyer is the authenticated requester, the
 * seller is derived from the lot, totalPrice is derived on write, and the
 * provenance source (exactly one of offerId / conversationId, 400-guarded in
 * the service) decides where the locked terms come FROM:
 *
 * - offerId: quantity and unitPrice are snapshotted from the ACCEPTED offer —
 *   the payload may only echo them (a disagreeing echo is 400
 *   OFFER_TERMS_MISMATCH; quantity must be present and equal, unitPrice may
 *   be omitted).
 * - conversationId: the FIXED-price quick path — unitPrice is locked to
 *   lot.unitPrice (the payload may omit or echo it; a disagreeing echo is
 *   400 DEAL_PRICE_LOCKED) and quantity is the buyer's chosen amount.
 *
 * The coarse per-field guards live here; the lot-relative rules (ACTIVE
 * status, availability ceiling, the enum-bound money ceiling on the derived
 * total) are business rules the service enforces through validateDealInput
 * (DEAL-001's shared validator) with the proper 4xx codes.
 */
export class CreateDealDto {
  @ApiPropertyOptional({
    example: 'clx…cuid',
    description:
      'Path (a): an ACCEPTED offer of the caller — its quantity/unitPrice are snapshotted onto the deal and the payload may only confirm them (400 OFFER_TERMS_MISMATCH). Mutually exclusive with conversationId (400)',
  })
  @IsOptional()
  @IsString()
  offerId?: string;

  @ApiPropertyOptional({
    example: 'clx…cuid',
    description:
      'Path (b): the caller’s own negotiation thread — FIXED-price lots only (409 LOT_NOT_FIXED_PRICE); the price locks to lot.unitPrice. Unknown and foreign threads answer the uniform 403 CONVERSATION_NOT_YOURS. Mutually exclusive with offerId (400)',
  })
  @IsOptional()
  @IsString()
  conversationId?: string;

  @ApiProperty({
    example: 500,
    minimum: 1,
    description:
      'Dealt piece count — on the offer path it MUST equal offer.quantity; on the quick path it is the buyer’s choice, validated 1..availableQuantity (409)',
  })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({
    example: 300_000,
    minimum: 1,
    maximum: DEAL_MAX_UNIT_PRICE,
    description:
      'Optional price CONFIRMATION echo — on the offer path it must equal offer.unitPrice, on the quick path lot.unitPrice (400 on disagreement); the deal’s actual price is always snapshotted server-side and totalPrice is derived (unitPrice × quantity)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(DEAL_MAX_UNIT_PRICE)
  unitPrice?: number;

  @ApiProperty({
    enum: DeliveryMethod,
    example: DeliveryMethod.SELLER_SHIPS,
    description: 'How the goods change hands — recorded terms (plan §3)',
  })
  @IsEnum(DeliveryMethod)
  deliveryMethod!: DeliveryMethod;

  @ApiProperty({
    enum: PaymentMethodRecorded,
    example: PaymentMethodRecorded.CARD_TO_CARD,
    description:
      'How payment happened — RECORDED ONLY (plan §3, D9): no gateway, no wallet, no escrow',
  })
  @IsEnum(PaymentMethodRecorded)
  paymentMethod!: PaymentMethodRecorded;

  @ApiPropertyOptional({
    example: 'لطفاً تا آخر هفته ارسال شود',
    maxLength: DEAL_NOTE_MAX_LENGTH,
    description: `Optional free-text delivery arrangement — ≤ ${DEAL_NOTE_MAX_LENGTH} characters (code points, service-checked); trimmed, empty → null`,
  })
  @IsOptional()
  @IsString()
  @Length(0, DEAL_NOTE_MAX_LENGTH)
  deliveryNote?: string;

  @ApiPropertyOptional({
    example: '۳ قسط در سه ماه',
    maxLength: DEAL_NOTE_MAX_LENGTH,
    description: `Optional free-text payment terms — ≤ ${DEAL_NOTE_MAX_LENGTH} characters (code points, service-checked); trimmed, empty → null`,
  })
  @IsOptional()
  @IsString()
  @Length(0, DEAL_NOTE_MAX_LENGTH)
  paymentTermsNote?: string;
}
