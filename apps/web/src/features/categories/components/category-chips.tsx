'use client';

import { Button } from '@/components/ui/button';
import { formatFaDigits } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useCategories } from '../hooks/use-categories';

export interface CategoryChipsProps {
  /** Selected category ids (parents and/or children). */
  selected: string[];
  onToggle: (categoryId: string) => void;
  /** Maximum selectable categories — unselected chips disable at the cap. */
  max?: number;
  disabled?: boolean;
  className?: string;
}

/**
 * Shared multi-select category chips (CAT-003): a flat list of «parent › child»
 * labels covering the whole two-level tree (parents included), like onboarding's
 * interests step. Fully controlled — selection lives with the caller; the only
 * internal state is the public tree via react-query (loading / empty /
 * error-retry handled here). Chips are ≥44px tall for reliable touch targets
 * and expose `aria-pressed` for selected state.
 */
export function CategoryChips({
  selected,
  onToggle,
  max,
  disabled = false,
  className,
}: CategoryChipsProps) {
  const { data: tree, isLoading, isError, refetch } = useCategories();

  if (isLoading) {
    return (
      <div
        aria-busy="true"
        aria-label="در حال بارگذاری دسته‌بندی‌ها"
        className={cn('flex flex-wrap gap-2', className)}
      >
        {Array.from({ length: 12 }).map((_, index) => (
          <span key={index} className="bg-muted h-11 w-24 animate-pulse rounded-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className={cn('py-6 text-center', className)}>
        <p className="text-muted-foreground text-sm">دسته‌بندی‌ها بارگذاری نشد.</p>
        <Button
          type="button"
          variant="outline"
          className="mt-3 h-11"
          onClick={() => void refetch()}
        >
          تلاش دوباره
        </Button>
      </div>
    );
  }

  if (!tree || tree.length === 0) {
    return (
      <p className={cn('text-muted-foreground py-6 text-center text-sm', className)}>
        دسته‌بندی‌ای یافت نشد.
      </p>
    );
  }

  const chips: Array<{ id: string; label: string }> = [];
  for (const root of tree) {
    chips.push({ id: root.id, label: root.nameFa });
    for (const child of root.children) {
      chips.push({ id: child.id, label: `${root.nameFa} › ${child.nameFa}` });
    }
  }

  const atMax = max !== undefined && selected.length >= max;

  return (
    <div role="group" aria-label="دسته‌بندی‌ها" className={className}>
      {max !== undefined ? (
        <p className="text-muted-foreground mb-3 text-sm">حداکثر {formatFaDigits(max)} دسته‌بندی</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {chips.map(({ id, label }) => {
          const isSelected = selected.includes(id);
          const chipDisabled = disabled || (!isSelected && atMax);
          return (
            <button
              key={id}
              type="button"
              aria-pressed={isSelected}
              disabled={chipDisabled}
              onClick={() => onToggle(id)}
              className={cn(
                'border-border bg-background text-foreground min-h-11 rounded-full border px-4 text-sm transition-colors',
                'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none',
                'disabled:pointer-events-none disabled:opacity-40',
                isSelected && 'border-primary bg-primary text-primary-foreground',
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
