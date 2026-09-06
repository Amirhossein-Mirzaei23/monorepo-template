'use client';

import { ShoppingBag, Store } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Step 1 — role selection: big touch cards (buyer / seller / both). */
export interface StepRoleProps {
  isBuyer: boolean;
  isSeller: boolean;
  error?: string;
  onChange: (role: { isBuyer?: boolean; isSeller?: boolean }) => void;
}

const CARDS = [
  {
    key: 'buyer' as const,
    icon: ShoppingBag,
    title: 'خریدار',
    description: 'دنبال لات‌های عمده برای خرید می‌گردم',
  },
  {
    key: 'seller' as const,
    icon: Store,
    title: 'فروشنده',
    description: 'کالای راکد دارم و می‌خواهم بفروشم',
  },
];

export function StepRole({ isBuyer, isSeller, error, onChange }: StepRoleProps) {
  return (
    <fieldset aria-invalid={Boolean(error) || undefined}>
      <legend className="text-foreground text-base font-semibold">نقش شما در راکدشو</legend>
      <p className="text-muted-foreground mt-1 text-sm">
        می‌توانید هر دو نقش را هم‌زمان انتخاب کنید.
      </p>
      <div className="mt-4 grid gap-3">
        {CARDS.map(({ key, icon: Icon, title, description }) => {
          const selected = key === 'buyer' ? isBuyer : isSeller;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={selected}
              onClick={() =>
                onChange(key === 'buyer' ? { isBuyer: !isBuyer } : { isSeller: !isSeller })
              }
              className={cn(
                'border-border bg-card flex min-h-20 items-center gap-3 rounded-xl border p-4 text-start transition-colors',
                'hover:border-primary/50 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none',
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
              <span>
                <span className="text-foreground block font-medium">{title}</span>
                <span className="text-muted-foreground mt-0.5 block text-sm">{description}</span>
              </span>
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
