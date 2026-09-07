'use client';

import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import type { LotPublicDetailResponseDto } from '@monorepo/shared-types';
import { cn } from '@/lib/utils';

/** One gallery entry (LotMediaResponseDto via the detail payload). */
type GalleryItem = LotPublicDetailResponseDto['media'][number];

/**
 * MKT-009 — the lot detail gallery (images + videos with posters), full-bleed
 * at the top of the page per ui-patterns.md:
 *
 * - MOBILE SWIPE: a scroll-snap strip (one slide per viewport width) — native
 *   touch scrolling, no carousel dependency. The dots indicator derives the
 * active slide from scrollLeft (abs() is used because RTL browsers disagree
 *   on its sign) — no per-slide button row to keep the DOM light.
 * - VIDEO: rendered inline with native controls + the API's poster thumb
 *   (thumbUrl); playback stays in the slide (no lightbox yet — the card only
 *   asks for inline play).
 * - FALLBACKS: a broken/missing image swaps to the placeholder tile (never a
 *   broken-image glyph), an empty gallery renders one placeholder slide.
 */
export function MediaGallery({
  media,
  title,
  className,
}: {
  media: GalleryItem[];
  /** Alt text base (the lot title) — the gallery speaks for one lot. */
  title: string;
  className?: string;
}) {
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());

  if (media.length === 0) {
    return (
      <div
        role="img"
        aria-label="تصویری برای این لات موجود نیست"
        className={cn('bg-muted flex aspect-square w-full items-center justify-center', className)}
      >
        <ImageOff className="text-zinc-400 size-10" aria-hidden="true" />
      </div>
    );
  }

  const onScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    if (el.clientWidth === 0) {
      return;
    }
    // RTL scrollLeft is negative in some engines, positive in others — abs().
    setActive(Math.min(media.length - 1, Math.round(Math.abs(el.scrollLeft) / el.clientWidth)));
  };

  return (
    <div className={cn('relative', className)}>
      <div
        className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth"
        onScroll={onScroll}
        aria-label={`گالری ${title}`}
      >
        {media.map((item, index) => {
          const broken = failed.has(item.id);
          if (item.kind === 'VIDEO') {
            return (
              <div key={item.id} className="bg-muted w-full shrink-0 snap-center">
                <video
                  // jsx-a11y media rules: control via native controls + label.
                  controls
                  preload="metadata"
                  poster={item.thumbUrl ?? undefined}
                  aria-label={`ویدیو: ${title}`}
                  className="aspect-square w-full object-contain"
                >
                  <source src={item.url} />
                  {/* Placeholder caption track — lot videos have no captions
                      yet (MEDIA-003 has no transcript pipeline); the track
                      satisfies the a11y media contract. */}
                  <track kind="captions" />
                  مرورگر شما از پخش ویدیو پشتیبانی نمی‌کند.
                </video>
              </div>
            );
          }
          return (
            <div key={item.id} className="bg-muted w-full shrink-0 snap-center">
              {broken ? (
                <div
                  role="img"
                  aria-label="تصویر در دسترس نیست"
                  className="flex aspect-square w-full items-center justify-center"
                >
                  <ImageOff className="text-zinc-400 size-10" aria-hidden="true" />
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- dynamic media URLs (media origin), next/image optimization not applicable
                <img
                  src={item.url}
                  alt={title}
                  // Slide 0 is the LCP element; the rest stay lazy.
                  loading={index === 0 ? 'eager' : 'lazy'}
                  className="aspect-square w-full object-cover"
                  onError={() => setFailed((prev) => new Set(prev).add(item.id))}
                />
              )}
            </div>
          );
        })}
      </div>

      {media.length > 1 ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex items-center justify-center gap-1.5">
          {media.map((item, index) => (
            <span
              key={item.id}
              aria-hidden="true"
              className={cn(
                'size-1.5 rounded-full transition-colors',
                index === active ? 'bg-white' : 'bg-white/50',
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
