import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Profile } from '@prisma/client';

/**
 * Read-side limits of the public sellers listing (MKT-004): the home
 * «تأییدشده‌ها» strip asks for 10 and the card caps the endpoint at 20 —
 * it is a discovery strip, never a directory.
 */
export const SELLERS_DEFAULT_LIMIT = 10;
export const SELLERS_MAX_LIMIT = 20;

/**
 * MKT-004 — minimal public seller summary for the home «تأییدشده‌ها» strip.
 * Deliberately TINY and allowlisted (mapped, not spread — same discipline as
 * the lot card): no userId, no bio/instagram/website, no metrics — those
 * belong to the full public seller profile (PROF-002), not a home strip.
 * province/city are iran-geo slugs; the web resolves the Persian labels from
 * its copy of the static list (same convention as every profile/location
 * payload). Verified-seller public pages (/s/{id}) arrive with PROF-002.
 */
export class PublicSellerSummaryDto {
  @ApiProperty({ example: 'clx…cuid' })
  id!: string;

  @ApiProperty({ example: 'مینا رضایی' })
  displayName!: string;

  @ApiPropertyOptional({ example: 'تولیدی پوشاک مینا', nullable: true, type: String })
  businessName!: string | null;

  @ApiPropertyOptional({ example: 'isfahan', nullable: true, type: String })
  province!: string | null;

  @ApiPropertyOptional({ example: 'kashan', nullable: true, type: String })
  city!: string | null;

  @ApiProperty({
    example: false,
    description:
      'TRS-001 placeholder — seller verification does not exist until Phase 7, so the API sends a hard-coded false; the home strip renders only when a verified=true call returns items and stays hidden until then',
  })
  verified!: boolean;
}

/** Envelope of GET /profiles/sellers — a plain list, no pagination metadata. */
export class PublicSellerListDto {
  @ApiProperty({ type: PublicSellerSummaryDto, isArray: true })
  items!: PublicSellerSummaryDto[];
}

/** Row shape the repository hands over (a plain Profile read — allowlisted by the mapper). */
export type SellerProfileRow = Pick<
  Profile,
  'id' | 'displayName' | 'businessName' | 'province' | 'city'
>;

/**
 * Maps a seller profile row onto the public strip summary. The allowlist is
 * the payload contract: exactly the fields above, nothing implicit.
 *
 * TRS-001 PLACEHOLDER (documented follow-up): the Profile model has no
 * verification field yet (Phase 7), so `verified` is hard-coded false. When
 * TRS-001 lands its verification model, this line becomes the real read
 * (approved BUSINESS_VERIFIED/SELLER_VERIFIED badge EXISTS) — until then
 * every seller maps to verified:false and a ?verified=true request yields an
 * empty list, which keeps the MKT-004 home strip honestly hidden instead of
 * faking trust.
 */
export function toPublicSellerSummary(profile: SellerProfileRow): PublicSellerSummaryDto {
  return {
    id: profile.id,
    displayName: profile.displayName,
    businessName: profile.businessName,
    province: profile.province,
    city: profile.city,
    verified: false,
  };
}
