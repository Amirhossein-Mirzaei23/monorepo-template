import type { DealStatus } from '@monorepo/shared-types';
import { cn } from '@/lib/utils';
import { DEAL_STATUS_LABELS_FA } from '../schemas/deal-schema';

/**
 * Semantic status chip (the OfferStatusChip precedent) — fa labels from the
 * schema map, colors from the palette's semantic set only (ui-patterns.md):
 * amber = live negotiation start, brand accent = agreed/paid movement,
 * emerald = completed, red = disputed, zinc = preparing/shipping + terminal
 * cancelled.
 */
const STATUS_CHIP_CLASSES: Record<DealStatus, string> = {
  NEGOTIATING: 'bg-amber-50 text-amber-700 border-amber-200',
  AGREED: 'bg-primary/10 text-primary border-primary/20',
  PAYMENT_PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  PAID: 'bg-primary/10 text-primary border-primary/20',
  PREPARING: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  SHIPPED: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  DELIVERED: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CANCELLED: 'bg-zinc-100 text-zinc-500 border-zinc-200',
  DISPUTED: 'bg-red-50 text-red-700 border-red-200',
};

export function DealStatusChip({ status, className }: { status: DealStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        STATUS_CHIP_CLASSES[status],
        className,
      )}
    >
      {DEAL_STATUS_LABELS_FA[status]}
    </span>
  );
}
