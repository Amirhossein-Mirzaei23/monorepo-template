'use client';

import { Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatFaDigits } from '@/lib/format';

/**
 * CHT-007 — the optimistic UPLOAD tile (the stage before the media bubble):
 * the picked file's local preview with a live progress overlay while the XHR
 * runs, or the Persian failure reason with «تلاش مجدد» / «حذف» actions when
 * it failed. Sits with the optimistic send bubbles at the bottom of the
 * thread; handed over to a MediaBubble the moment the upload commits.
 */

export interface MediaBubblePendingProps {
  kind: 'IMAGE' | 'VIDEO';
  /** Object URL of the local file (the tile's preview). */
  localPreviewUrl: string;
  status: 'uploading' | 'failed';
  /** Upload progress 0–100 (`uploading` only). */
  progress?: number;
  /** Persian failure reason (`failed` only). */
  error?: string;
  onRetry?: () => void;
  onRemove?: () => void;
}

export function MediaBubblePending({
  kind,
  localPreviewUrl,
  status,
  progress,
  error,
  onRetry,
  onRemove,
}: MediaBubblePendingProps) {
  return (
    <div className="flex w-full justify-end">
      <div
        className={cn(
          'max-w-[80%] overflow-hidden rounded-2xl rounded-ee-sm',
          status === 'failed' ? 'border border-red-200 bg-red-50' : 'bg-zinc-100',
        )}
      >
        <div className="relative h-32 w-44 bg-zinc-200 sm:w-52">
          {localPreviewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- local blob preview, next/image optimization not applicable
            <img
              src={localPreviewUrl}
              alt={kind === 'IMAGE' ? 'تصویر در حال ارسال' : 'ویدیو در حال ارسال'}
              className={cn('h-full w-full object-cover', status === 'failed' && 'opacity-60')}
            />
          ) : null}
          {status === 'uploading' ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/35">
              <Loader2 className="size-5 animate-spin text-white" aria-hidden="true" />
              {/* Percent only during the XHR stage; the POST stage (undefined
                  progress) shows the spinner alone. */}
              {progress !== undefined ? (
                <span className="text-xs font-medium text-white" role="status">
                  {formatFaDigits(progress)}٪
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
          <span
            className={cn(
              'text-[11px] leading-none',
              status === 'failed' ? 'text-red-600' : 'text-zinc-500',
            )}
          >
            {status === 'failed' ? (error ?? 'آپلود ناموفق بود') : 'در حال ارسال…'}
          </span>
          {status === 'failed' ? (
            <span className="flex items-center gap-1">
              {onRetry ? (
                <button
                  type="button"
                  onClick={onRetry}
                  aria-label="تلاش مجدد برای آپلود"
                  className="inline-flex size-6 cursor-pointer items-center justify-center rounded-full text-red-600 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                >
                  <RotateCcw className="size-3.5" aria-hidden="true" />
                </button>
              ) : null}
              {onRemove ? (
                <button
                  type="button"
                  onClick={onRemove}
                  aria-label="حذف پیوست"
                  className="inline-flex size-6 cursor-pointer items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
