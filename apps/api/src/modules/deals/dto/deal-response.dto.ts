import { ApiProperty } from '@nestjs/swagger';
import { DealStatus, DeliveryMethod, PaymentMethodRecorded, type Deal } from '@prisma/client';

/**
 * DEAL-002 — the Deals API contract. DealResponseDto is a strict ALLOWLIST
 * mapper (the backend rule: payloads never leak by default): the public
 * `code` handle, the lot summary the header renders, the locked terms
 * snapshot, the lifecycle state and `myRole` — the caller's side, resolved by
 * the endpoint (buyer on create; DEAL-003's transitions extend the role set).
 *
 * The terms notes (deliveryNote / paymentTermsNote) ARE part of the locked
 * terms — the offers response exposes its `note` the same way.
 *
 * Notably ABSENT (and locked out by the allowlist e2e test): buyerId /
 * sellerId (identity leaks the allowlist does not carry), lotId (the lot
 * summary's `code` is the public reference), offerId / conversationId (the
 * provenance bindings are server-side bookkeeping) and every internal column
 * (cancelReason / disputeReason / commission fields — the detail UI of
 * DEAL-004 must surface them through a deliberate shape change, not an
 * accident).
 */

/** The lot summary block every deal payload carries (public reference only —
 * deliberately narrower than the offers' summary: a deal's price is its own
 * snapshot, the lot's asking price would only confuse). */
export class DealLotSummaryDto {
  @ApiProperty({
    example: '7Kd2Qm9x',
    description:
      'Public, non-sequential lot code — the only lot reference the deal payload carries',
  })
  code!: string;

  @ApiProperty({ example: 'عمده پیراهن مردانه — ۵۰ عدد' })
  title!: string;
}

/** The caller's side of a deal — buyer on DEAL-002's create; DEAL-003's
 * participant-scoped reads resolve seller views through the same type. */
export const DEAL_MY_ROLES = ['buyer', 'seller'] as const;

export type DealMyRole = (typeof DEAL_MY_ROLES)[number];

export class DealResponseDto {
  @ApiProperty({
    example: 'clx…cuid',
    description: 'Deal id — internal; the :code is the URL handle',
  })
  id!: string;

  @ApiProperty({
    example: '9Xk2Qm7b',
    description: 'Public, non-sequential code (nanoid-8 scheme) — the deal’s URL id',
  })
  code!: string;

  @ApiProperty({ type: DealLotSummaryDto, description: 'The deal’s lot — public summary' })
  lot!: DealLotSummaryDto;

  @ApiProperty({
    example: 500,
    minimum: 1,
    description: 'Dealt piece count (the creation snapshot)',
  })
  quantity!: number;

  @ApiProperty({
    example: 300_000,
    description: 'Agreed per-unit Toman price (the creation snapshot — lot edits never mutate it)',
  })
  unitPrice!: number;

  @ApiProperty({
    example: 150_000_000,
    description: 'Derived on write server-side: unitPrice × quantity (the headline amount)',
  })
  totalPrice!: number;

  @ApiProperty({ enum: DeliveryMethod, example: DeliveryMethod.SELLER_SHIPS })
  deliveryMethod!: DeliveryMethod;

  @ApiProperty({
    example: 'بسته‌بندی کارتنی',
    nullable: true,
    description: 'The locked delivery arrangement (null when the payload sent none)',
  })
  deliveryNote!: string | null;

  @ApiProperty({ enum: PaymentMethodRecorded, example: PaymentMethodRecorded.CARD_TO_CARD })
  paymentMethod!: PaymentMethodRecorded;

  @ApiProperty({
    example: '۳ قسط در سه ماه',
    nullable: true,
    description: 'The locked payment terms (null when the payload sent none)',
  })
  paymentTermsNote!: string | null;

  @ApiProperty({ enum: DealStatus, example: DealStatus.NEGOTIATING })
  status!: DealStatus;

  @ApiProperty({ example: '2026-09-05T10:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({
    enum: DEAL_MY_ROLES,
    example: 'buyer',
    description:
      'The CALLER’s side of this deal — buyer on creation; seller views come via DEAL-003',
  })
  myRole!: DealMyRole;
}

/** The lot slice the summary mapper consumes (a full lot row qualifies). */
export type DealLotSummaryRow = { code: string; title: string };

/** A row the deal mapper reads: Deal + the joined lot summary. */
export type DealResponseRow = Deal & { lot: DealLotSummaryRow };

/**
 * Allowlist mapper — copies ONLY the DealResponseDto fields. `myRole` comes
 * from the CALLER (service-resolved), never from the row. A new Deal column
 * must be added here explicitly to surface in payloads (the unit + e2e
 * allowlist tests pin the exact key set).
 */
export function toDealResponse(row: DealResponseRow, myRole: DealMyRole): DealResponseDto {
  return {
    id: row.id,
    code: row.code,
    lot: { code: row.lot.code, title: row.lot.title },
    quantity: row.quantity,
    unitPrice: row.unitPrice,
    totalPrice: row.totalPrice,
    deliveryMethod: row.deliveryMethod,
    deliveryNote: row.deliveryNote,
    paymentMethod: row.paymentMethod,
    paymentTermsNote: row.paymentTermsNote,
    status: row.status,
    createdAt: row.createdAt,
    myRole,
  };
}
