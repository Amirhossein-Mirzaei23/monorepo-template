'use client';

import { useEffect, useState } from 'react';
import { Check, CheckCheck, Clock, FileVideo, RotateCcw, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatTimeFa } from '@/lib/format';
import { useSecureMedia } from '../hooks/use-secure-media';
import { MEDIA_FORBIDDEN_FA, MEDIA_LOAD_FAILED_FA } from '../lib/secure-media';

/**
 * CHT-007 — the IMAGE/VIDEO bubble. Same chrome as MessageBubble (own =
 * primary, counterpart = zinc-100, timestamp + ticks at the foot, failed =
 * red with a retry tap); the payload is media, not text:
 *
 * - bytes load through the AUTHED FETCH → blob URL hook (useSecureMedia —
 *   GET /media/secure/{key} with the bearer; object URLs revoked on unmount);
 * - IMAGE renders the cheaper preview key (the 1200w WebP cover); tapping
 *   opens a FULLSCREEN overlay that lazily fetches the original key and
 *   closes via the backdrop, the ✕ button or Escape;
 * - VIDEO renders the poster thumb with a play affordance; first tap swaps
 *   in an inline <video> whose src is the blob of the ORIGINAL key
 *   (tap-to-play — video bytes stay unfetched until then), with a close
 *   control that releases them again. Poster-less videos (the API allows
 *   none) show a generic icon tile;
 * - WS `message:new` IMAGE/VIDEO rows render through the exact same path —
 *   the bubble is a pure function of the message row.
 */

export interface MediaBubbleProps {
  mediaType: 'IMAGE' | 'VIDEO';
  /** Original bytes key (streamed for the fullscreen view / the player). */
  storageKey: string;
  /** IMAGE cover variant / VIDEO poster thumb — the bubble's still. */
  previewKey: string | null;
  createdAt: string;
  variant: 'own' | 'other';
  readAt?: string | null;
  status?: 'sending' | 'failed';
  onRetry?: () => void;
}

/** What the heavy (original-key) bytes are being opened for right now. */
type OpenedView = 'none' | 'image' | 'video';

/** Fixed overlay: original image + close affordances (backdrop, ✕, Escape). */
function FullscreenImage({ url, onClose }: { url: string; onClose: () => void }) {
  // Escape closes for keyboard users (the backdrop button is the tab stop).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="نمایش تمام‌صفحه تصویر"
      className="fixed inset-0 z-50"
    >
      {/* Full-size interactive backdrop — tap anywhere closes. */}
      <button
        type="button"
        aria-label="بستن تصویر"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70"
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="بستن"
        className="absolute end-3 top-3 z-10 flex size-11 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <X className="size-6" aria-hidden="true" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element -- blob URL (authed fetch), next/image optimization not applicable */}
      <img
        src={url}
        alt="پیوست تصویری"
        className="pointer-events-none absolute inset-0 m-auto max-h-full max-w-full object-contain p-4"
      />
    </div>
  );
}

export function MediaBubble({
  mediaType,
  storageKey,
  previewKey,
  createdAt,
  variant,
  readAt,
  status,
  onRetry,
}: MediaBubbleProps) {
  const isOwn = variant === 'own';
  const isFailed = status === 'failed';
  const isSending = status === 'sending';

  // The bubble's still: IMAGE cover variant / VIDEO poster thumb (may be null
  // for poster-less videos → generic icon tile).
  const still = useSecureMedia(previewKey);
  // Lazily fetched heavy bytes: the original image (fullscreen) / video (player).
  const [view, setView] = useState<OpenedView>('none');
  const heavy = useSecureMedia(view === 'none' ? null : storageKey);

  const openMedia = () => {
    if (isFailed || isSending) {
      return;
    }
    setView(mediaType === 'IMAGE' ? 'image' : 'video');
  };

  const playerReady = view === 'video' && heavy.status === 'ready' && heavy.url !== null;

  return (
    <div className={cn('flex w-full', isOwn ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] overflow-hidden rounded-2xl',
          isOwn
            ? 'rounded-ee-sm bg-primary text-primary-foreground'
            : 'rounded-ss-sm bg-zinc-100 text-zinc-900',
          isFailed && 'border border-red-200 bg-red-50 text-red-700',
        )}
      >
        <div className="relative">
          {playerReady ? (
            <div className="relative">
              <video
                src={heavy.url ?? undefined}
                controls
                autoPlay
                className="max-h-72 w-full max-w-xs bg-black"
                aria-label="پخش ویدیو"
              >
                {/* Chat clips have no caption source yet; the empty track
                    keeps the media element accessible-conformant. */}
                <track kind="captions" />
              </video>
              <button
                type="button"
                onClick={() => setView('none')}
                aria-label="بستن پخش‌کننده"
                className="absolute end-2 top-2 flex size-8 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          ) : still.status === 'ready' && still.url !== null ? (
            <button
              type="button"
              onClick={openMedia}
              aria-label={mediaType === 'IMAGE' ? 'نمایش تصویر در اندازه کامل' : 'پخش ویدیو'}
              className="relative block cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- blob URL (authed fetch), next/image optimization not applicable */}
              <img
                src={still.url}
                alt={mediaType === 'IMAGE' ? 'پیوست تصویری' : 'تصویر شاخص ویدیو'}
                className="max-h-72 w-56 object-cover"
              />
              {mediaType === 'VIDEO' ? (
                <span className="absolute inset-0 grid place-items-center">
                  <span className="flex size-12 items-center justify-center rounded-full bg-black/55 text-white">
                    <FileVideo className="size-6" aria-hidden="true" />
                  </span>
                </span>
              ) : null}
            </button>
          ) : still.status === 'error' || heavy.status === 'error' ? (
            // Error / forbidden / poster-less video tile.
            <div className="grid h-40 w-56 place-items-center gap-2 bg-zinc-200 p-3 text-center">
              <FileVideo className="text-muted-foreground size-8" aria-hidden="true" />
              <p className="text-xs leading-5">
                {(still.status === 'error' && still.forbidden) ||
                (heavy.status === 'error' && heavy.forbidden)
                  ? MEDIA_FORBIDDEN_FA
                  : MEDIA_LOAD_FAILED_FA}
              </p>
            </div>
          ) : (
            <div className="grid h-40 w-56 animate-pulse place-items-center bg-zinc-200">
              <span className="text-muted-foreground text-xs">در حال بارگذاری…</span>
            </div>
          )}
        </div>

        <span
          className={cn(
            'flex items-center justify-end gap-1 px-3 pb-1.5 pt-1 text-[11px] leading-none',
            isOwn ? 'text-primary-foreground/70' : 'text-zinc-500',
            isFailed && 'text-red-600',
          )}
        >
          <time dateTime={createdAt}>{formatTimeFa(createdAt)}</time>

          {isOwn && isSending ? (
            <Clock className="size-3.5" aria-label="در حال ارسال" role="img" />
          ) : null}

          {isOwn && !isSending && !isFailed ? (
            readAt ? (
              <CheckCheck
                className="size-3.5 text-primary-foreground"
                aria-label="خوانده شد"
                role="img"
              />
            ) : (
              <Check className="size-3.5" aria-label="ارسال شد" role="img" />
            )
          ) : null}

          {isOwn && isFailed && onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              aria-label="تلاش مجدد برای ارسال"
              className="inline-flex size-5 cursor-pointer items-center justify-center rounded-full hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
            >
              <RotateCcw className="size-3" aria-hidden="true" />
            </button>
          ) : null}
        </span>
      </div>

      {view === 'image' && heavy.status === 'ready' && heavy.url !== null ? (
        <FullscreenImage url={heavy.url} onClose={() => setView('none')} />
      ) : null}
    </div>
  );
}
