'use client';

import { Check } from 'lucide-react';
import type { DealEventViewDto } from '@monorepo/shared-types';
import { cn } from '@/lib/utils';
import { formatFaDigits, formatJalali, formatRelativeTimeFa } from '@/lib/format';
import { DEAL_STATUS_LABELS_FA } from '../schemas/deal-schema';

/**
 * DEAL-004 — the deal's audit timeline (every DealEvent, oldest first): a
 * stage dot + the fa status move, the actor side (خریدار / فروشنده — resolved
 * server-side; a system event shows no actor), the fa note when the move
 * carried one (creation announcement, payment announcement, reasons), and the
 * Jalali + relative time inline-muted. The LATEST entry is the deal's current
 * state (emerald dot); the rest are zinc.
 */
const ACTOR_LABELS_FA: Record<'buyer' | 'seller', string> = {
  buyer: 'خریدار',
  seller: 'فروشنده',
};

export function StatusTimeline({ events }: { events: DealEventViewDto[] }) {
  return (
    <ol
      aria-label="خط زمانی معامله"
      className="relative ms-3 space-y-5 border-s border-zinc-200 ps-5"
      data-testid="status-timeline"
    >
      {events.map((event, index) => {
        const isLatest = index === events.length - 1;
        return (
          <li key={event.id} className="relative">
            <span
              aria-hidden="true"
              className={cn(
                'absolute -start-[27px] top-1 size-3 rounded-full border-2 border-white',
                isLatest ? 'bg-emerald-600' : 'bg-zinc-300',
              )}
            />
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-sm font-medium">
                {DEAL_STATUS_LABELS_FA[event.toStatus]}
                {event.fromStatus !== event.toStatus ? (
                  <span className="text-muted-foreground font-normal">
                    {' '}
                    · از «{DEAL_STATUS_LABELS_FA[event.fromStatus]}»
                  </span>
                ) : null}
                {event.actorRole !== null ? (
                  <span className="text-muted-foreground font-normal">
                    {' '}
                    · {ACTOR_LABELS_FA[event.actorRole]}
                    {isLatest ? (
                      <Check className="ms-1 inline size-3.5 text-emerald-600" aria-hidden="true" />
                    ) : null}
                  </span>
                ) : null}
              </p>
            </div>
            {event.note !== null ? (
              <p className="mt-1 rounded-lg bg-zinc-50 px-2.5 py-1.5 text-xs leading-5 text-zinc-600">
                {event.note}
              </p>
            ) : null}
            <p
              className="text-muted-foreground mt-1 text-[11px]"
              title={formatJalali(event.createdAt)}
            >
              {formatRelativeTimeFa(event.createdAt)} ·{' '}
              {formatFaDigits(new Date(event.createdAt).toLocaleDateString('fa-IR'))}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
