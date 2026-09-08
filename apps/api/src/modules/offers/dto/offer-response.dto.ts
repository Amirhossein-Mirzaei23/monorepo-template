import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OfferStatus, type Lot, type Offer } from '@prisma/client';
import type { OfferListRow } from '../offers.repository';
import type { OfferMyRole } from '../offers.constants';

/**
 * OFR-002 — the Offers API contract. OfferResponseDto is a strict ALLOWLIST
 * mapper (the backend rule: payloads never leak by default): id, the lot
 * summary the list cards render, the negotiation terms, the lifecycle stamps
 * and `myRole` — the caller's side, resolved by the endpoint (buyer on
 * create/cancel + role=buyer lists, seller on seller actions + role=seller /
 * lot listings). Deliberately FLAT for now (card note): no chain context —
 * the counter timeline is a future card's concern.
 *
 * Notably ABSENT (and locked out by the allowlist e2e test): buyerId /
 * sellerId (identity leaks the allowlist does not carry), lotId (the lot
 * summary's `code` is the public reference), conversationId (the thread
 * binding is server-side bookkeeping) and parentId (chain context, future).
 */

/** The lot summary block every offer payload carries (public reference only). */
export class OfferLotSummaryDto {
  @ApiProperty({
    example: '7Kd2Qm9x',
    description:
      'Public, non-sequential lot code — the only lot reference the offer payload carries',
  })
  code!: string;

  @ApiProperty({ example: 'عمده پیراهن مردانه — ۵۰ عدد' })
  title!: string;

  @ApiProperty({
    example: 2_250_000,
    description: 'The lot’s asking per-unit price — the baseline the negotiation moves against',
  })
  unitPrice!: number;
}

export class OfferResponseDto {
  @ApiProperty({ example: 'clx…cuid', description: 'Offer id — the :id of every action route' })
  id!: string;

  @ApiProperty({ type: OfferLotSummaryDto, description: 'The offered lot’s public summary' })
  lot!: OfferLotSummaryDto;

  @ApiProperty({ example: 500, minimum: 1, description: 'Offered piece count' })
  quantity!: number;

  @ApiProperty({
    example: 300_000,
    description: 'Negotiated per-unit Toman price — the number the counters move',
  })
  unitPrice!: number;

  @ApiProperty({
    example: 150_000_000,
    description: 'Derived on write server-side: unitPrice × quantity (the headline amount)',
  })
  totalPrice!: number;

  @ApiPropertyOptional({
    example: 'لطفاً تا آخر هفته ارسال شود',
    nullable: true,
    type: String,
    description: 'The maker’s optional note (null when absent)',
  })
  note!: string | null;

  @ApiProperty({ enum: OfferStatus, example: 'PENDING' })
  status!: OfferStatus;

  @ApiProperty({
    example: '2026-09-08T10:00:00.000Z',
    description: 'Decision deadline (+72 h from creation, fresh on every counter)',
  })
  expiresAt!: Date;

  @ApiPropertyOptional({
    example: '2026-09-05T12:00:00.000Z',
    nullable: true,
    type: Date,
    description: 'Decision stamp — set by every legal transition (all leave PENDING)',
  })
  decidedAt!: Date | null;

  @ApiProperty({ example: '2026-09-05T10:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({
    enum: ['buyer', 'seller'],
    example: 'buyer',
    description: 'The CALLER’s side of this offer — buyer: I made it; seller: my lot received it',
  })
  myRole!: OfferMyRole;
}

/** The lot slice the summary mapper consumes (the repository include / a full
 * lot row both satisfy it — fakes qualify). */
export type OfferLotSummaryRow = Pick<Lot, 'code' | 'title' | 'unitPrice'>;

/** A row the offer mapper reads: Offer + the joined lot summary. */
export type OfferResponseRow = Offer & { lot: OfferLotSummaryRow };

/**
 * Allowlist mapper — copies ONLY the OfferResponseDto fields. `myRole` comes
 * from the CALLER (service-resolved), never from the row. A new Offer column
 * must be added here explicitly to surface in payloads (the unit + e2e
 * allowlist tests pin the exact key set).
 */
export function toOfferResponse(row: OfferResponseRow, myRole: OfferMyRole): OfferResponseDto {
  return {
    id: row.id,
    lot: { code: row.lot.code, title: row.lot.title, unitPrice: row.lot.unitPrice },
    quantity: row.quantity,
    unitPrice: row.unitPrice,
    totalPrice: row.totalPrice,
    note: row.note,
    status: row.status,
    expiresAt: row.expiresAt,
    decidedAt: row.decidedAt,
    createdAt: row.createdAt,
    myRole,
  };
}

/** Adapter: a full Lot row (the service already holds it on write paths) → the summary. */
export function lotSummaryOf(lot: OfferLotSummaryRow): OfferLotSummaryRow {
  return { code: lot.code, title: lot.title, unitPrice: lot.unitPrice };
}

/** Re-exported so the controller can register the type without a wider import. */
export type { OfferListRow };
