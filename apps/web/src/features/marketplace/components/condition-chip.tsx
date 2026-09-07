import type { LotCondition } from '@monorepo/shared-types';
import { cn } from '@/lib/utils';
import { LOT_CONDITION_LABELS_FA } from './labels';

/**
 * Condition chip (MKT-005) — fa labels from the shared label map, colors from
 * the palette's semantic set only (ui-patterns.md: emerald/amber/red + zinc
 * neutrals; no other color families). Trust-level mapping, kept to one tone
 * per meaning:
 * - emerald = sound goods (GRADE_A, GRADE_B, NEW)
 * - amber   = imperfect/mixed or expiring (GRADE_C, MIXED, NEAR_EXPIRY)
 * - red     = DAMAGED — the one state a buyer must never miss
 * - zinc    = USED — normal second-hand, a fact rather than a warning
 */
const CONDITION_CHIP_CLASSES: Record<LotCondition, string> = {
  GRADE_A: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  GRADE_B: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  GRADE_C: 'bg-amber-50 text-amber-700 border-amber-200',
  MIXED: 'bg-amber-50 text-amber-700 border-amber-200',
  NEW: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  USED: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  DAMAGED: 'bg-red-50 text-red-700 border-red-200',
  NEAR_EXPIRY: 'bg-amber-50 text-amber-700 border-amber-200',
};

export function ConditionChip({
  condition,
  className,
}: {
  condition: LotCondition;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        CONDITION_CHIP_CLASSES[condition],
        className,
      )}
    >
      {LOT_CONDITION_LABELS_FA[condition]}
    </span>
  );
}
