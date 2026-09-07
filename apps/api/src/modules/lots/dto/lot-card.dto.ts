import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LotCondition, LotUnit, type Lot, type LotMedia, type MediaAsset } from '@prisma/client';

/**
 * MKT-001 — the public lot CARD: the atomic payload of every list surface
 * (browse grid, home sections, infinite scroll — MKT-004/005/006). It is the
 * third allowlisted mapper of the lots module (alongside the LOT-002 public +
 * owner shapes), tuned for lists:
 *
 * - NEVER carries `exactAddress` / `rejectionReason` (plan R7 privacy, same as
 *   the public shape) — and NOT `locationHint` either: the hint is public per
 *   plan §3 but belongs to the DETAIL page, which adds it in MKT-009; the card
 *   shows city/province only. The e2e allowlist test locks all three out.
 * - Carries BOTH ids: `code` is the public URL id (plan §11 — detail pages live
 *   at `/l/{code}`); `id` stays in the payload for client-side cache keys and
 *   dedupe (infinite-scroll lists). Only `code` ever appears in a URL.
 * - `seller` is the minimal summary the card renders: `{ id, name,
 *   businessName }` — `name` from the User row, `businessName` from the
 *   seller's Profile (null when absent). Display precedence web-side:
 *   `businessName ?? name`. Profile.displayName is deliberately omitted (the
 *   User.name already covers the person display; one of the two suffices).
 * - `verifiedSeller` is a HARD-CODED false placeholder: the Verification model
 *   and badge reads do not exist until TRS-001/002 (Phase 7). The field is in
 *   the contract NOW so the web (MKT-005) renders the slot without a later
 *   breaking change. FOLLOW-UP (TRS-001): flip to a real lookup of an APPROVED
 *   BUSINESS_VERIFIED/SELLER_VERIFIED verification for the seller.
 * - `coverThumbUrl` is absolute (PUBLIC_MEDIA_BASE_URL + key), resolved from
 *   the single isCover LotMedia link: thumbKey (sharp WebP thumb for images,
 *   poster thumb for videos — MEDIA-002/003) when the variant exists, else the
 *   original storageKey; null when the lot has no cover (the card renders its
 *   placeholder — MKT-005). Unit/duration and the rest of the gallery are not
 *   part of the card.
 */

/** The seller summary joined by the repository card include (structurally — fakes qualify). */
export type LotCardSellerRow = {
  id: string;
  name: string;
  profile: { businessName: string | null } | null;
};

/** The cover link joined by the repository card include (structurally — fakes qualify). */
export type LotCardCoverRow = Pick<LotMedia, 'isCover'> & {
  mediaAsset: Pick<MediaAsset, 'thumbKey' | 'storageKey'>;
};

/** Repository row the card mapper consumes: Lot + seller summary + cover link. */
export type LotCardRow = Lot & {
  seller: LotCardSellerRow;
  media?: LotCardCoverRow[];
};

export class LotCardSellerDto {
  @ApiProperty({ example: 'clx…cuid', description: 'Seller user id — links the public profile' })
  id!: string;

  @ApiProperty({ example: 'مینا رضایی', description: 'User.name — the person/fallback display' })
  name!: string;

  @ApiPropertyOptional({
    example: 'تولیدی پوشاک مینا',
    nullable: true,
    type: String,
    description: 'Profile.businessName — preferred display when set (businessName ?? name)',
  })
  businessName!: string | null;
}

export class LotCardResponseDto {
  @ApiProperty({
    example: 'clx…cuid',
    description: 'Internal id — client cache keys only, never in URLs',
  })
  id!: string;

  @ApiProperty({
    example: '7Kd2Qm9x',
    description: 'Public, non-sequential URL id (nanoid-8 base62) — detail pages live at /l/{code}',
    minLength: 8,
    maxLength: 8,
  })
  code!: string;

  @ApiProperty({ example: 'عمده پیراهن مردانه — ۵۰ عدد', minLength: 5, maxLength: 120 })
  title!: string;

  @ApiProperty({
    example: 2_250_000,
    description: 'Derived on write server-side: round(totalPrice / quantity)',
  })
  unitPrice!: number;

  @ApiProperty({ example: 112_500_000, minimum: 1, maximum: 2_000_000_000 })
  totalPrice!: number;

  @ApiProperty({ example: 50, minimum: 1 })
  quantity!: number;

  @ApiProperty({ example: 50, description: 'Remaining sellable amount (0 ≤ available ≤ quantity)' })
  availableQuantity!: number;

  @ApiProperty({ enum: LotUnit, example: 'PIECE' })
  unit!: LotUnit;

  @ApiProperty({ enum: LotCondition, example: 'GRADE_A' })
  condition!: LotCondition;

  @ApiProperty({ example: 'tehran', description: 'City slug (static geo list)' })
  city!: string;

  @ApiProperty({ example: 'tehran', description: 'Province slug (static geo list)' })
  province!: string;

  @ApiPropertyOptional({
    example: 'http://localhost:3001/media/2026/09/abc…123t.webp',
    nullable: true,
    type: String,
    description:
      'Absolute cover thumb (PUBLIC_MEDIA_BASE_URL + thumbKey, falling back to storageKey); null when the lot has no cover',
  })
  coverThumbUrl!: string | null;

  @ApiProperty({ type: LotCardSellerDto, description: 'Minimal seller summary for the card' })
  seller!: LotCardSellerDto;

  @ApiProperty({
    example: false,
    description:
      'PLACEHOLDER — always false until TRS-001/002 land verification badges (Phase 7); contract slot for the web',
  })
  verifiedSeller!: boolean;

  @ApiProperty({ example: '2026-09-05T00:00:00.000Z' })
  updatedAt!: Date;

  @ApiProperty({
    example: '2026-09-05T00:00:00.000Z',
    description: 'Newest-first default sort key',
  })
  createdAt!: Date;

  @ApiProperty({
    example: '2026-10-05T00:00:00.000Z',
    description: 'Listing expiry — the ending-soon sort key (sort=expiresAt)',
  })
  expiresAt!: Date;
}

/**
 * Allowlist mapper — copies ONLY the card fields listed above. A new Lot
 * column must be added here explicitly to surface in the card (nothing leaks
 * by default; the unit + e2e allowlist tests pin the exact key set).
 * `mediaBaseUrl` is the PUBLIC_MEDIA_BASE_URL resolved by the caller (service
 * boundary) so the mapper stays pure.
 * The cover link is picked by its `isCover` flag (the repository include
 * already filters to the single cover; flag-picking keeps the mapper correct
 * for rows read with the wider gallery include too).
 */
export function toLotCardResponse(lot: LotCardRow, mediaBaseUrl: string): LotCardResponseDto {
  const base = mediaBaseUrl.replace(/\/+$/, '');
  const cover = (lot.media ?? []).find((link) => link.isCover);
  return {
    id: lot.id,
    code: lot.code,
    title: lot.title,
    unitPrice: lot.unitPrice,
    totalPrice: lot.totalPrice,
    quantity: lot.quantity,
    availableQuantity: lot.availableQuantity,
    unit: lot.unit,
    condition: lot.condition,
    city: lot.city,
    province: lot.province,
    coverThumbUrl: cover
      ? `${base}/${cover.mediaAsset.thumbKey ?? cover.mediaAsset.storageKey}`
      : null,
    seller: {
      id: lot.seller.id,
      name: lot.seller.name,
      businessName: lot.seller.profile?.businessName ?? null,
    },
    // TRS-001/002 placeholder — see the class doc; never compute a real value here.
    verifiedSeller: false,
    updatedAt: lot.updatedAt,
    createdAt: lot.createdAt,
    expiresAt: lot.expiresAt,
  };
}
