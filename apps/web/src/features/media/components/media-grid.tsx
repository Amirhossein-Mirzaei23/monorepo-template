'use client';

import { ArrowDown, ArrowUp, Film, Play, RotateCcw, TriangleAlert, X } from 'lucide-react';
import { formatFaDigits } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { MediaItem } from '../types';
import { formatVideoDuration } from '../lib/limits';

export interface MediaGridProps {
  items: MediaItem[];
  /** Reorder mode («مرتب‌سازی») — tiles become tap-to-swap targets with arrows. */
  editMode: boolean;
  /** Currently selected tile in tap-to-swap (null = none selected yet). */
  selectedKey: string | null;
  /** Tapping a tile in edit mode selects it, tapping a second one swaps the two. */
  onTileActivate: (key: string) => void;
  onMove: (key: string, direction: -1 | 1) => void;
  /** Tapping the «کاور» badge promotes the item to cover (index 0). */
  onSetCover: (key: string) => void;
  onRetry: (key: string) => void;
  onRemove: (key: string) => void;
  className?: string;
}

/**
 * MEDIA-004 tile grid (2 columns on mobile per ui-patterns). Renders each
 * {@link MediaItem} in its lifecycle state — uploading (progress overlay),
 * error (alert + retry/remove) or ready (media, cover badge, remove) — plus
 * the mobile-first reorder controls in edit mode. Purely presentational:
 * all state flows in via props.
 */
export function MediaGrid({
  items,
  editMode,
  selectedKey,
  onTileActivate,
  onMove,
  onSetCover,
  onRetry,
  onRemove,
  className,
}: MediaGridProps) {
  return (
    <div
      role="list"
      aria-label="رسانه‌های انتخاب‌شده"
      className={cn('grid grid-cols-2 gap-3', className)}
    >
      {items.map((item, index) => {
        const isCover = index === 0 && item.status === 'ready';
        const isSelected = editMode && selectedKey === item.key;
        const kindLabel = item.kind === 'image' ? 'تصویر' : 'ویدیو';
        const position = formatFaDigits(index + 1);
        const imageAlt = item.kind === 'image' ? `تصویر ${position}` : `پوستر ویدیو ${position}`;
        // An <img> only makes sense for image items, poster/thumb variants, or
        // a blob preview — never for a ready video's raw .mp4/.webm URL.
        const showImage =
          item.status === 'ready'
            ? item.kind === 'image' || Boolean(item.thumbUrl)
            : item.status === 'uploading' && Boolean(item.url);
        return (
          <div
            key={item.key}
            role="listitem"
            className={cn(
              'border-border bg-muted relative aspect-square overflow-hidden rounded-xl border',
              isSelected && 'border-primary ring-primary/40 ring-2',
              item.status === 'error' && 'border-destructive/60',
            )}
          >
            {showImage ? (
              // eslint-disable-next-line @next/next/no-img-element -- dynamic media URLs (media origin), next/image optimization not applicable
              <img
                src={item.thumbUrl ?? item.url}
                alt={imageAlt}
                className="size-full object-cover"
              />
            ) : null}

            {item.kind === 'video' && item.status === 'ready' ? (
              <>
                {item.thumbUrl ? (
                  <span className="bg-zinc-950/40 absolute inset-0 flex items-center justify-center">
                    <Play className="size-8 text-white" aria-hidden="true" />
                  </span>
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <Film className="text-muted-foreground size-10" aria-hidden="true" />
                  </span>
                )}
                {item.durationMs !== undefined && item.durationMs > 0 ? (
                  <span className="bg-zinc-950/70 pointer-events-none absolute bottom-1.5 end-1.5 rounded-full px-2 py-0.5 text-xs text-white">
                    {formatVideoDuration(item.durationMs)}
                  </span>
                ) : null}
              </>
            ) : null}

            {item.status === 'uploading' ? (
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={item.progress ?? 0}
                aria-label={`در حال آپلود ${kindLabel}`}
                className="bg-zinc-950/60 absolute inset-0 flex items-center justify-center"
              >
                <span className="text-sm font-medium text-white">
                  در حال آپلود… ٪{formatFaDigits(item.progress ?? 0)}
                </span>
              </div>
            ) : null}

            {item.status === 'error' ? (
              <div
                role="alert"
                className="bg-destructive/10 absolute inset-0 flex flex-col items-center justify-center gap-1 p-2 text-center"
              >
                <TriangleAlert className="text-destructive size-6" aria-hidden="true" />
                <p className="text-destructive line-clamp-2 text-xs leading-5">{item.error}</p>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onRetry(item.key)}
                    aria-label={`تلاش دوباره برای آپلود ${kindLabel}`}
                    className="text-destructive hover:bg-destructive/10 flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-md px-2 text-xs font-medium outline-none focus-visible:ring-[3px]"
                  >
                    <RotateCcw className="size-4" aria-hidden="true" />
                    تلاش دوباره
                  </button>
                </div>
              </div>
            ) : null}

            {editMode && item.status !== 'error' ? (
              <button
                type="button"
                aria-pressed={isSelected}
                aria-label={`انتخاب ${kindLabel} ${formatFaDigits(index + 1)} برای جابه‌جایی`}
                onClick={() => onTileActivate(item.key)}
                className="absolute inset-0 cursor-pointer outline-none focus-visible:ring-primary/50 focus-visible:ring-2"
              />
            ) : null}

            {item.status === 'ready' ? (
              isCover ? (
                <span className="bg-primary pointer-events-none absolute start-1.5 top-1.5 rounded-full px-2 py-0.5 text-xs font-medium text-white">
                  کاور
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onSetCover(item.key)}
                  aria-label={`تنظیم ${kindLabel} ${formatFaDigits(index + 1)} به‌عنوان کاور`}
                  className="bg-zinc-950/70 absolute start-1.5 top-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium text-white outline-none hover:bg-zinc-950/90 focus-visible:ring-[3px]"
                >
                  کاور
                </button>
              )
            ) : null}

            <button
              type="button"
              onClick={() => onRemove(item.key)}
              aria-label={`حذف ${kindLabel} ${formatFaDigits(index + 1)}`}
              className="bg-zinc-950/70 absolute end-1.5 top-1.5 flex size-11 items-center justify-center rounded-full text-white outline-none hover:bg-zinc-950/90 focus-visible:ring-[3px]"
            >
              <X className="size-4" aria-hidden="true" />
            </button>

            {editMode && item.status !== 'error' ? (
              <div className="absolute bottom-1.5 start-1.5 flex gap-1">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => onMove(item.key, -1)}
                  aria-label={`جابه‌جایی ${kindLabel} ${formatFaDigits(index + 1)} به بالا`}
                  className="bg-zinc-950/70 flex size-11 items-center justify-center rounded-full text-white outline-none hover:bg-zinc-950/90 focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-40"
                >
                  <ArrowUp className="size-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  disabled={index === items.length - 1}
                  onClick={() => onMove(item.key, 1)}
                  aria-label={`جابه‌جایی ${kindLabel} ${formatFaDigits(index + 1)} به پایین`}
                  className="bg-zinc-950/70 flex size-11 items-center justify-center rounded-full text-white outline-none hover:bg-zinc-950/90 focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-40"
                >
                  <ArrowDown className="size-4" aria-hidden="true" />
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
