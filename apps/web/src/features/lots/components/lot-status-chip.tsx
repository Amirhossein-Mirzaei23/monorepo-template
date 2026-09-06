import type { LotStatus } from '@monorepo/shared-types';
import { cn } from '@/lib/utils';
import { LOT_STATUS_LABELS_FA } from '../schemas/lot-schema';

/**
 * Semantic status chip (LOT-005) — fa labels from the shared constants map,
 * colors from the palette's semantic set only (ui-patterns.md): emerald =
 * live/success, amber = waiting, red = rejected, zinc = neutral/rest.
 */
const STATUS_CHIP_CLASSES: Record<LotStatus, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PENDING_REVIEW: 'bg-amber-50 text-amber-700 border-amber-200',
  PAUSED: 'bg-amber-50 text-amber-700 border-amber-200',
  DRAFT: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  REJECTED: 'bg-red-50 text-red-700 border-red-200',
  EXPIRED: 'bg-zinc-100 text-zinc-500 border-zinc-200',
  SOLD: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  REMOVED: 'bg-zinc-100 text-zinc-400 border-zinc-200',
};

export function LotStatusChip({ status, className }: { status: LotStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        STATUS_CHIP_CLASSES[status],
        className,
      )}
    >
      {LOT_STATUS_LABELS_FA[status]}
    </span>
  );
}
