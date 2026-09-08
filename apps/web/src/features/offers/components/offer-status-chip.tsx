import type { OfferStatus } from '@monorepo/shared-types';
import { cn } from '@/lib/utils';
import { OFFER_STATUS_LABELS_FA } from '../schemas/offer-schema';

/**
 * Semantic status chip (the LotStatusChip precedent) — fa labels from the
 * schema map, colors from the palette's semantic set only (ui-patterns.md):
 * amber = waiting, emerald = accepted/success, red = rejected, brand accent =
 * countered (the one live negotiation move), zinc = neutral terminal states.
 */
const STATUS_CHIP_CLASSES: Record<OfferStatus, string> = {
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  COUNTERED: 'bg-primary/10 text-primary border-primary/20',
  ACCEPTED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  REJECTED: 'bg-red-50 text-red-700 border-red-200',
  CANCELLED: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  EXPIRED: 'bg-zinc-100 text-zinc-500 border-zinc-200',
};

export function OfferStatusChip({
  status,
  className,
}: {
  status: OfferStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        STATUS_CHIP_CLASSES[status],
        className,
      )}
    >
      {OFFER_STATUS_LABELS_FA[status]}
    </span>
  );
}
