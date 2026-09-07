import { MapPin, Store } from 'lucide-react';
import type { LotPublicDetailResponseDto } from '@monorepo/shared-types';
import { IRAN_PROVINCES } from '@/lib/iran-geo';
import { VerifiedBadge } from './verified-badge';

/**
 * City slugs are globally unique across the static geo list (iran-geo docs),
 * so the seller block's bare city slug resolves by a flat scan — the seller
 * payload carries no province slug.
 */
function cityLabelFa(citySlug: string): string {
  return (
    IRAN_PROVINCES.flatMap((province) => province.cities).find((city) => city.slug === citySlug)
      ?.nameFa ?? citySlug
  );
}

/**
 * MKT-009 — the seller summary card on the detail page: display name
 * (businessName ?? name, mirroring the card's precedence), business city and
 * the verified badge slot.
 *
 * FOLLOW-UP (TRS-001/002): `verified` is a hard false in the API until
 * verification reads land, so the badge stays hidden in practice. FOLLOW-UP
 * (PROF-002/ANL-002): this card becomes a LINK to /s/{id} and gains the
 * seller metrics strip (deals/years active) once those payloads exist — the
 * API's seller block deliberately carries no metrics today.
 */
export function SellerSummary({ seller }: { seller: LotPublicDetailResponseDto['seller'] }) {
  return (
    <section aria-label="فروشنده" className="flex items-center gap-3 rounded-xl border p-3">
      <span
        aria-hidden="true"
        className="bg-primary/10 text-primary flex size-11 shrink-0 items-center justify-center rounded-full"
      >
        <Store className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{seller.businessName ?? seller.name}</p>
        <p className="text-muted-foreground flex items-center gap-1 text-xs">
          <MapPin className="size-3.5" aria-hidden="true" />
          {seller.city ? cityLabelFa(seller.city) : 'فروشنده راکدشو'}
        </p>
      </div>
      {seller.verified ? <VerifiedBadge /> : null}
    </section>
  );
}
