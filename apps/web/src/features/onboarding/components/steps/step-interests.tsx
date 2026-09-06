'use client';

import type { CategoryTreeNodeDto } from '@monorepo/shared-types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatFaDigits } from '@/lib/format';

export interface StepInterestsProps {
  tree: CategoryTreeNodeDto[] | undefined;
  selected: string[];
  max: number;
  error?: string;
  isLoading: boolean;
  loadError: boolean;
  onRetry: () => void;
  onToggle: (categoryId: string) => void;
}

/** Step 3 — interests: multi-select category chips (root «parent › child» labels). */
export function StepInterests({
  tree,
  selected,
  max,
  error,
  isLoading,
  loadError,
  onRetry,
  onToggle,
}: StepInterestsProps) {
  if (isLoading) {
    return (
      <div aria-busy="true" aria-label="در حال بارگذاری دسته‌بندی‌ها">
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 12 }).map((_, index) => (
            <span key={index} className="bg-muted h-9 w-24 animate-pulse rounded-full" />
          ))}
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="py-6 text-center">
        <p className="text-muted-foreground text-sm">دسته‌بندی‌ها بارگذاری نشد.</p>
        <Button type="button" variant="outline" className="mt-3 h-11" onClick={onRetry}>
          تلاش دوباره
        </Button>
      </div>
    );
  }

  const chips: Array<{ id: string; label: string }> = [];
  for (const root of tree ?? []) {
    chips.push({ id: root.id, label: root.nameFa });
    for (const child of root.children) {
      chips.push({ id: child.id, label: `${root.nameFa} › ${child.nameFa}` });
    }
  }

  return (
    <fieldset aria-invalid={Boolean(error) || undefined}>
      <legend className="text-foreground text-base font-semibold">علاقه‌مندی‌ها</legend>
      <p className="text-muted-foreground mt-1 text-sm">
        حداکثر {formatFaDigits(max)} دسته‌بندی — برای شخصی‌سازی بازارچه.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {chips.map(({ id, label }) => {
          const isSelected = selected.includes(id);
          const disabled = !isSelected && selected.length >= max;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={isSelected}
              disabled={disabled}
              onClick={() => onToggle(id)}
              className={cn(
                'border-border bg-background text-foreground min-h-9 rounded-full border px-3 text-sm transition-colors',
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
      {error ? (
        <p role="alert" className="text-destructive mt-2 text-sm">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
