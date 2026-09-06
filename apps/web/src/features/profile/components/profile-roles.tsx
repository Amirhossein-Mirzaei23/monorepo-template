'use client';

import { Lock, ShoppingBag, Store } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Role section with ADD-ONLY semantics (PROF-001): held hats render as locked
 * selections («نقش فعلی — قابل حذف نیست» — the API rejects removals by design:
 * "adds accountRole, never removes history"), a missing hat can be granted
 * with one tap and is saved with the next «ذخیره تغییرات».
 */
export function ProfileRoles({
  isBuyer: heldBuyer,
  isSeller: heldSeller,
  addedBuyer,
  addedSeller,
  onToggleAdd,
  error,
}: {
  isBuyer: boolean;
  isSeller: boolean;
  /** Newly granted hats in the form (not yet saved). */
  addedBuyer: boolean;
  addedSeller: boolean;
  onToggleAdd: (role: 'buyer' | 'seller') => void;
  error?: string;
}) {
  const cards = [
    {
      key: 'buyer' as const,
      icon: ShoppingBag,
      title: 'خریدار',
      description: 'دنبال لات‌های عمده برای خرید می‌گردم',
      held: heldBuyer,
      added: addedBuyer,
    },
    {
      key: 'seller' as const,
      icon: Store,
      title: 'فروشنده',
      description: 'کالای راکد دارم و می‌خواهم بفروشم',
      held: heldSeller,
      added: addedSeller,
    },
  ];

  return (
    <fieldset aria-invalid={Boolean(error) || undefined}>
      <legend className="text-foreground text-base font-semibold">نقش‌های من</legend>
      <p className="text-muted-foreground mt-1 text-sm">
        می‌توانید نقش تازه‌ای اضافه کنید؛ نقش‌های فعلی حذف نمی‌شوند.
      </p>
      <div className="mt-4 grid gap-3">
        {cards.map(({ key, icon: Icon, title, description, held, added }) => {
          const selected = held || added;
          const disabled = held;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onToggleAdd(key)}
              className={cn(
                'border-border bg-card flex min-h-20 items-center gap-3 rounded-xl border p-4 text-start transition-colors',
                'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none',
                'disabled:cursor-not-allowed',
                selected && 'border-primary bg-primary/5',
              )}
            >
              <span
                className={cn(
                  'flex size-11 shrink-0 items-center justify-center rounded-lg border',
                  selected ? 'border-primary text-primary' : 'border-border text-muted-foreground',
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="text-foreground block font-medium">{title}</span>
                <span className="text-muted-foreground mt-0.5 block text-sm">{description}</span>
              </span>
              {held ? (
                <span className="text-muted-foreground ms-auto flex shrink-0 items-center gap-1 text-xs">
                  <Lock className="size-3.5" aria-hidden="true" />
                  نقش فعلی
                </span>
              ) : selected ? (
                <span className="text-primary ms-auto shrink-0 text-xs">افزوده می‌شود</span>
              ) : null}
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
