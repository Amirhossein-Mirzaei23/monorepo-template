'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Heart, ImageOff, MapPin } from 'lucide-react';
import type { LotCardResponseDto } from '@monorepo/shared-types';
import { formatFaDigits, formatRelativeTimeFa, formatToman } from '@/lib/format';
import { findIranCity } from '@/lib/iran-geo';
import { cn } from '@/lib/utils';
import { ConditionChip } from './condition-chip';
import { LOT_UNIT_LABELS_FA } from './labels';
import { VerifiedBadge } from './verified-badge';

/** Card layout: `grid` = 2-col vertical tile, `list` = 1-col horizontal row. */
export type LotCardVariant = 'grid' | 'list';

export interface LotCardProps {
  /** MKT-001 card payload (GET /lots items). */
  lot: LotCardResponseDto;
  /** Grid = vertical tile (2-col mobile grid), list = horizontal row. */
  variant?: LotCardVariant;
  /**
   * Save-heart gate — `false` (the default) renders no heart until SAV-001
   * lands; pass `true` together with `onToggleSave` once saving exists.
   */
  saveable?: boolean;
  saved?: boolean;
  onToggleSave?: () => void;
  className?: string;
}

/** Flex direction of the card body per variant (image side stays square). */
const LINK_VARIANT_CLASSES: Record<LotCardVariant, string> = {
  grid: 'flex-col',
  list: 'flex-row',
};

/** Cover width per variant: full-bleed tile vs fixed thumb beside the body. */
const IMAGE_VARIANT_CLASSES: Record<LotCardVariant, string> = {
  grid: 'w-full',
  list: 'w-24 sm:w-28',
};

/**
 * MKT-005 — the atomic UI of every lot list surface (home sections, browse
 * grid, saved lists, seller profile). Commerce-card hierarchy per
 * ui-patterns.md: aspect-square lazy cover, 2-line title, total price bold +
 * «هر واحد ~» unit price muted, quantity + condition chips, city + verified
 * badge row, seller name + relative time.
 *
 * Accessibility: the whole visual card is ONE link to /l/{code} (image, title
 * and body live inside it); the save heart is a SEPARATE button absolutely
 * positioned outside the Link — no nested interactive elements, both reachable
 * by keyboard, heart carries aria-pressed + the «ذخیره» label. A missing or
 * broken cover swaps to a placeholder tile (never a broken-image glyph).
 */
export function LotCard({
  lot,
  variant = 'grid',
  saveable = false,
  saved = false,
  onToggleSave,
  className,
}: LotCardProps) {
  const [coverFailed, setCoverFailed] = useState(false);
  const hasCover = Boolean(lot.coverThumbUrl) && !coverFailed;
  // Payload slugs resolve against the static geo list; unknown slugs pass through.
  const cityName = findIranCity(lot.province, lot.city)?.nameFa ?? lot.city;
  // Display precedence mirrors the API's card mapper: business name first.
  const sellerName = lot.seller.businessName ?? lot.seller.name;

  return (
    <div className={cn('relative', className)}>
      <Link
        href={`/l/${lot.code}`}
        className={cn(
          'border-border bg-card text-card-foreground focus-visible:ring-ring/50 flex overflow-hidden rounded-xl border transition-colors hover:border-zinc-300 focus-visible:outline-none focus-visible:ring-2',
          LINK_VARIANT_CLASSES[variant],
        )}
      >
        <div
          className={cn(
            'bg-muted relative aspect-square shrink-0 overflow-hidden',
            IMAGE_VARIANT_CLASSES[variant],
          )}
        >
          {hasCover && lot.coverThumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- dynamic media URLs (media origin), next/image optimization not applicable
            <img
              src={lot.coverThumbUrl}
              alt={lot.title}
              loading="lazy"
              className="size-full object-cover"
              onError={() => setCoverFailed(true)}
            />
          ) : (
            <div
              role="img"
              aria-label="تصویری برای این لات موجود نیست"
              className="flex size-full items-center justify-center"
            >
              <ImageOff className="text-zinc-400 size-8" aria-hidden="true" />
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
          <h3 className="text-foreground line-clamp-2 text-sm leading-5 font-semibold">
            {lot.title}
          </h3>
          <p className="text-foreground text-base font-bold">{formatToman(lot.totalPrice)}</p>
          <p className="text-muted-foreground text-xs">هر واحد ~{formatToman(lot.unitPrice)}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="bg-zinc-100 text-zinc-700 rounded-full px-2 py-0.5 text-xs font-medium">
              {formatFaDigits(lot.quantity)} {LOT_UNIT_LABELS_FA[lot.unit]}
            </span>
            <ConditionChip condition={lot.condition} />
          </div>
          <div className="text-muted-foreground mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-xs">
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden="true" />
              {cityName}
            </span>
            {lot.verifiedSeller ? <VerifiedBadge /> : null}
          </div>
          <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
            <span className="truncate font-medium">{sellerName}</span>
            <span className="shrink-0">{formatRelativeTimeFa(lot.updatedAt)}</span>
          </div>
        </div>
      </Link>

      {saveable ? (
        <button
          type="button"
          aria-pressed={saved}
          aria-label="ذخیره"
          onClick={onToggleSave}
          className="absolute end-2 top-2 z-10 flex size-11 items-center justify-center rounded-full bg-white/90 text-zinc-700 shadow-sm outline-none hover:bg-white focus-visible:ring-ring/50 focus-visible:ring-2"
        >
          <Heart
            className={cn('size-5', saved ? 'fill-red-600 text-red-600' : 'text-zinc-600')}
            aria-hidden="true"
          />
        </button>
      ) : null}
    </div>
  );
}

export interface LotCardSkeletonProps {
  variant?: LotCardVariant;
  className?: string;
}

/** Loading placeholder matching the final card layout (ui-patterns.md). */
export function LotCardSkeleton({ variant = 'grid', className }: LotCardSkeletonProps) {
  return (
    <div aria-hidden="true" className={cn('bg-card overflow-hidden rounded-xl border', className)}>
      <div className={cn('flex', LINK_VARIANT_CLASSES[variant])}>
        <div
          className={cn(
            'bg-muted aspect-square shrink-0 animate-pulse',
            IMAGE_VARIANT_CLASSES[variant],
          )}
        />
        <div className="flex-1 space-y-2 p-3">
          <div className="bg-muted h-4 w-3/4 animate-pulse rounded" />
          <div className="bg-muted h-5 w-1/2 animate-pulse rounded" />
          <div className="bg-muted h-4 w-2/3 animate-pulse rounded" />
          <div className="bg-muted h-3 w-1/2 animate-pulse rounded" />
        </div>
      </div>
    </div>
  );
}
