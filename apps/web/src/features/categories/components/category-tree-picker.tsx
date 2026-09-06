'use client';

import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useCategories } from '../hooks/use-categories';

/** Controlled selection of the two-level tree: parent required for child. */
export interface CategoryPickerValue {
  parentId?: string;
  childId?: string;
}

export interface CategoryTreePickerProps {
  value: CategoryPickerValue;
  onChange: (value: CategoryPickerValue) => void;
  /** Disables both selects (e.g. while a surrounding form submits). */
  disabled?: boolean;
  className?: string;
}

const selectClass =
  'border-input bg-background text-foreground h-11 w-full rounded-md border px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:opacity-50';

/**
 * Shared two-level category picker (CAT-003): cascading native `<select>`s —
 * parent on the first tap, child on the second («پوشاک → مردانه»). Native
 * selects are used on purpose: they are the most reliable, keyboard-accessible
 * control on mobile browsers. Fully controlled — the only state fetched
 * internally is the public tree via react-query (loading / empty / error-retry
 * handled here).
 *
 * The API tree is active-only, so inactive/unknown ids simply never render as
 * options; a stale controlled value degrades to the placeholder.
 *
 * Follow-up (not in scope here): a `variant="sheet"` bottom-sheet presentation
 * for mobile filter surfaces — blocked until the repo has a sheet primitive.
 */
export function CategoryTreePicker({
  value,
  onChange,
  disabled = false,
  className,
}: CategoryTreePickerProps) {
  const id = useId();
  const parentId = `${id}-parent`;
  const childId = `${id}-child`;
  const { data: tree, isLoading, isError, refetch } = useCategories();

  if (isLoading) {
    return (
      <div
        aria-busy="true"
        aria-label="در حال بارگذاری دسته‌بندی‌ها"
        className={cn('grid gap-4', className)}
      >
        <div className="grid gap-2">
          <span className="bg-muted h-4 w-16 animate-pulse rounded" />
          <div className="bg-muted h-11 w-full animate-pulse rounded-md" />
        </div>
        <div className="grid gap-2">
          <span className="bg-muted h-4 w-16 animate-pulse rounded" />
          <div className="bg-muted h-11 w-full animate-pulse rounded-md" />
        </div>
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

  // Unknown ids (deactivated or from an older taxonomy) degrade to placeholders.
  const selectedParent = tree.find((node) => node.id === value.parentId);
  const parentValue = selectedParent?.id ?? '';
  const childValue = selectedParent?.children.some((child) => child.id === value.childId)
    ? (value.childId ?? '')
    : '';

  return (
    <div className={cn('grid gap-4', className)}>
      <div className="grid gap-2">
        <Label htmlFor={parentId}>دسته‌بندی</Label>
        <select
          id={parentId}
          value={parentValue}
          disabled={disabled}
          className={selectClass}
          onChange={(event) =>
            onChange({
              parentId: event.target.value || undefined,
              childId: undefined, // a new parent always resets the child
            })
          }
        >
          <option value="">انتخاب دسته‌بندی</option>
          {tree.map((node) => (
            <option key={node.id} value={node.id}>
              {node.nameFa}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={childId}>زیر‌دسته</Label>
        <select
          id={childId}
          value={childValue}
          disabled={disabled || !selectedParent}
          className={selectClass}
          onChange={(event) =>
            onChange({
              parentId: value.parentId,
              childId: event.target.value || undefined,
            })
          }
        >
          <option value="">{selectedParent ? 'همه زیر‌دسته‌ها' : 'ابتدا دسته‌بندی'}</option>
          {selectedParent?.children.map((child) => (
            <option key={child.id} value={child.id}>
              {child.nameFa}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
