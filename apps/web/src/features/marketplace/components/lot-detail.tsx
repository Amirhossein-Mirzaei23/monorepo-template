'use client';

import { useState } from 'react';
import { Heart, MapPin, MessageCircle, Share2, Tag } from 'lucide-react';
import type { LotPublicDetailResponseDto } from '@monorepo/shared-types';
import { Button } from '@/components/ui/button';
import { formatToman } from '@/lib/format';
import { findIranCity } from '@/lib/iran-geo';
import { cn } from '@/lib/utils';
import { shareLot } from '../lib/share';
import { LotCard } from './lot-card';
import { MediaGallery } from './media-gallery';
import { SellerSummary } from './seller-summary';
import { ShareSheet } from './share-sheet';
import { SpecBlock } from './spec-block';

/**
 * MKT-009 — the lot detail surface (client island fed by the RSC page): media
 * gallery, price + location header, full spec block, description, seller
 * summary and the similar-lots grid (MKT-001 cards, 2-col mobile grid).
 *
 * CTA states (card: "CTAs may land disabled-first" — CHT-001/OFR-001/SAV-001
 * have not landed):
 * - «گفتگو با فروشنده» + «پیشنهاد قیمت»: disabled with the «به‌زودی» tooltip;
 *   CHT-001 wires the chat CTA, OFR-001 the offer sheet.
 * - Save heart: disabled visual-only — SAV-001 owns real saving (no endpoint
 *   yet), so there is no onToggleSave to fake.
 * - Share (MKT-010): FUNCTIONAL — native navigator.share when the platform
 *   offers it, else the MKT-010 share sheet (کپی لینک / تلگرام / واتساپ).
 * - Report: OMITTED entirely — the card feature-flags it behind TRS-004 (the
 *   report dialog does not exist yet); add it there, not here.
 *
 * The action bar is sticky to the bottom on mobile (52px CTAs, thumb reach —
 * ui-patterns.md); ≥md the same buttons render inline under the price.
 */
export interface LotDetailProps {
  /** GET /lots/:code payload (server-fetched; never re-fetched client-side). */
  lot: LotPublicDetailResponseDto;
  className?: string;
}

export function LotDetail({ lot, className }: LotDetailProps) {
  const [shareOpen, setShareOpen] = useState(false);
  // Payload slugs resolve against the static geo list; unknown slugs pass through.
  const cityFa = findIranCity(lot.province, lot.city)?.nameFa ?? lot.city;
  // The card's exact location contract: «{city} — {locationHint}», nothing more
  // precise (the address is private per plan R7).
  const location = lot.locationHint ? `${cityFa} — ${lot.locationHint}` : cityFa;

  const handleShare = async () => {
    // Native share first (mobile Safari/Chrome); 'sheet' = no navigator.share.
    const outcome = await shareLot({
      code: lot.code,
      title: lot.title,
      unitPrice: lot.unitPrice,
      city: cityFa,
    });
    if (outcome === 'sheet') {
      setShareOpen(true);
    }
  };

  const actions = (
    <>
      <button
        type="button"
        disabled
        aria-label="ذخیره (به‌زودی)"
        title="به‌زودی"
        className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-xl border text-zinc-500"
      >
        <Heart className="size-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="هم‌رسانی"
        onClick={() => {
          void handleShare();
        }}
        className="hover:bg-accent flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-xl border outline-none focus-visible:ring-2"
      >
        <Share2 className="size-5" aria-hidden="true" />
      </button>
      <Button disabled title="به‌زودی" className="h-[52px] flex-1 text-sm font-semibold">
        <MessageCircle className="size-5" aria-hidden="true" />
        گفتگو با فروشنده
      </Button>
      <Button
        disabled
        title="به‌زودی"
        variant="outline"
        className="h-[52px] flex-1 text-sm font-semibold"
      >
        <Tag className="size-5" aria-hidden="true" />
        پیشنهاد قیمت
      </Button>
    </>
  );

  return (
    <article className={cn('pb-28 md:pb-10', className)}>
      <MediaGallery media={lot.media} title={lot.title} />

      <div className="mx-auto w-full max-w-(--app-max-width) px-4 pt-4 sm:px-6">
        <header className="space-y-2">
          <h1 className="text-lg leading-7 font-bold">{lot.title}</h1>
          <p className="text-muted-foreground flex items-center gap-1 text-sm">
            <MapPin className="size-4 shrink-0" aria-hidden="true" />
            {location}
          </p>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pt-1">
            <p className="text-2xl font-bold">{formatToman(lot.totalPrice)}</p>
            <p className="text-muted-foreground text-sm">هر واحد ~{formatToman(lot.unitPrice)}</p>
          </div>
        </header>

        {/* Desktop action row — the sticky bar below is the mobile surface. */}
        <div className="mt-4 hidden gap-2 md:flex">{actions}</div>

        <div className="mt-5">
          <SpecBlock lot={lot} />
        </div>

        <section aria-label="توضیحات" className="mt-6">
          <h2 className="mb-2 text-base font-semibold">توضیحات</h2>
          <p className="text-sm leading-6 whitespace-pre-line">{lot.description}</p>
        </section>

        <div className="mt-6">
          <SellerSummary seller={lot.seller} />
        </div>

        {lot.similar.length > 0 ? (
          <section aria-label="لات‌های مشابه" className="mt-8">
            <h2 className="mb-3 text-base font-semibold">لات‌های مشابه</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {lot.similar.map((card) => (
                <LotCard key={card.id} lot={card} />
              ))}
            </div>
          </section>
        ) : null}
      </div>

      {/* Sticky mobile action bar (safe-area padded, 52px CTAs). */}
      <div className="bg-card/95 fixed inset-x-0 bottom-0 z-10 border-t p-3 md:hidden [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex w-full max-w-(--app-max-width) gap-2">{actions}</div>
      </div>

      {/* MKT-010 fallback share sheet — mounted only while open (the
          FiltersSheet/MKT-008 pattern, so its manual-copy state resets per
          open); opens when navigator.share is absent. */}
      {shareOpen ? (
        <ShareSheet
          open={shareOpen}
          onOpenChange={setShareOpen}
          code={lot.code}
          title={lot.title}
          unitPrice={lot.unitPrice}
          city={cityFa}
        />
      ) : null}
    </article>
  );
}
