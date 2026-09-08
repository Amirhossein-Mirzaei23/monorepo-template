'use client';

import { Handshake } from 'lucide-react';
import type { OfferStatus } from '@monorepo/shared-types';
import { formatTimeFa } from '@/lib/format';
import { cn } from '@/lib/utils';
import { OfferStatusChip } from './offer-status-chip';

/**
 * OFR-004 — offer history timeline IN THE CONVERSATION THREAD (the card's
 * "chain cards with status chips"), rendered for MessageType.ACTION rows.
 *
 * DOCUMENTED INTERPRETATION (the pragmatic one, per the card's own scope):
 * OFR-002 stores ACTION messages as TEXT-in-ACTION — the body IS the stored fa
 * copy («پیشنهاد ۱۵۰ میلیون تومان برای ۵۰۰ عدد» / «پیشنهاد پذیرفته شد» /
 * «پیشنهاد رد شد») and Message carries NO offerId/chain reference (feature #19
 * owns structured payloads). So the chain cards render the stored fa body
 * offer-flavored, and the status chip is derived from the body copy where the
 * copy states the outcome (accept/reject); a plain proposal ACTION has no
 * client-known status and renders with the neutral «پیشنهاد» tag only. The
 * FULL chain with authoritative statuses lives in the /offers list
 * (offer-card.tsx); when feature #19 lands a payload reference, this component
 * upgrades to real chain data without changing the thread layout.
 */

/** Outcome chip derivable from an ACTION body — null = status unknown client-side. */
export function offerStatusFromBody(body: string): OfferStatus | null {
  if (body.includes('پذیرفته شد')) {
    return 'ACCEPTED';
  }
  if (body.includes('رد شد')) {
    return 'REJECTED';
  }
  return null;
}

export interface OfferActionBubbleProps {
  /** The stored ACTION body (fa copy written by the API). */
  body: string;
  createdAt: string;
  /** Which side acted — only shifts the alignment + accent, like bubbles. */
  variant: 'own' | 'other';
}

/** One offer chain card in the thread — never a plain chat bubble. */
export function OfferActionBubble({ body, createdAt, variant }: OfferActionBubbleProps) {
  const isOwn = variant === 'own';
  const status = offerStatusFromBody(body);

  return (
    <div className={cn('flex w-full', isOwn ? 'justify-end' : 'justify-start')}>
      <div
        data-slot="offer-action-card"
        className={cn(
          'max-w-[80%] rounded-2xl border px-3 py-2',
          isOwn
            ? 'rounded-ee-sm border-primary/30 bg-primary/5'
            : 'rounded-ss-sm border-zinc-200 bg-white',
        )}
      >
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
              isOwn ? 'bg-primary/10 text-primary' : 'bg-zinc-100 text-zinc-600',
            )}
          >
            <Handshake className="size-3" aria-hidden="true" />
            پیشنهاد
          </span>
          {status ? <OfferStatusChip status={status} /> : null}
        </div>
        <p className="mt-1 text-sm leading-6 font-medium text-zinc-900">{body}</p>
        <span className="mt-0.5 flex justify-end text-[11px] leading-none text-zinc-500">
          <time dateTime={createdAt}>{formatTimeFa(createdAt)}</time>
        </span>
      </div>
    </div>
  );
}
