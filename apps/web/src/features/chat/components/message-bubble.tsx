'use client';

import { Check, CheckCheck, Clock, RotateCcw } from 'lucide-react';
import { formatTimeFa } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * CHT-006 — one WhatsApp-style bubble (ui-patterns.md → WhatsApp-style chat):
 *
 * - own = primary background / white text, END-aligned (RTL mirror of the
 *   classic right-aligned own bubble), tail radius on the bottom-end corner;
 * - counterpart = zinc-100, START-aligned, tail on the bottom-start corner;
 * - max-w-[80%] on every bubble; timestamp + ticks inline at the bubble foot;
 * - ticks on OWN bubbles only: ✓ delivered (server row with readAt null),
 *   ✓✓ read (counterpart's readAt stamp); an in-flight optimistic bubble
 *   shows a clock, a failed one turns red with a retry tap;
 * - SYSTEM rows (senderId null — the CHT-001 welcome, future block notices)
 *   render as a centered gray pill instead of a bubble.
 */

export interface MessageBubbleProps {
  body: string;
  /** ISO datetime — rendered as HH:mm Persian digits. */
  createdAt: string;
  variant: 'own' | 'other' | 'system';
  /** Counterpart's read stamp on own messages; undefined on the other side. */
  readAt?: string | null;
  /** Optimistic send state (own bubbles only, while pending). */
  status?: 'sending' | 'failed';
  /** Retry tap for a failed optimistic bubble. */
  onRetry?: () => void;
}

export function MessageBubble({
  body,
  createdAt,
  variant,
  readAt,
  status,
  onRetry,
}: MessageBubbleProps) {
  if (variant === 'system') {
    return (
      <div className="mx-auto w-fit max-w-[80%] rounded-full bg-zinc-100 px-3 py-1.5 text-center text-xs leading-5 text-zinc-500">
        {body}
      </div>
    );
  }

  const isOwn = variant === 'own';
  const isFailed = status === 'failed';
  const isSending = status === 'sending';

  return (
    <div className={cn('flex w-full', isOwn ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-6',
          isOwn
            ? 'rounded-ee-sm bg-primary text-primary-foreground'
            : 'rounded-ss-sm bg-zinc-100 text-zinc-900',
          isFailed && 'bg-red-50 text-red-700 border border-red-200',
        )}
      >
        <p className="whitespace-pre-wrap break-words">{body}</p>

        <span
          className={cn(
            'mt-0.5 flex items-center justify-end gap-1 text-[11px] leading-none',
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
    </div>
  );
}
