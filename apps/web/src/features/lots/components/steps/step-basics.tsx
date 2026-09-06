'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface BasicsValue {
  title: string;
  description: string;
}

export interface StepBasicsProps {
  value: BasicsValue;
  errors: Partial<BasicsValue>;
  onChange: (patch: Partial<BasicsValue>) => void;
}

/** Wizard step 2 — title (5–120) and description (≤5000, textarea). */
export function StepBasics({ value, errors, onChange }: StepBasicsProps) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="lot-title">عنوان آگهی</Label>
        <Input
          id="lot-title"
          value={value.title}
          onChange={(event) => onChange({ title: event.target.value })}
          aria-invalid={Boolean(errors.title) || undefined}
          placeholder="مثلاً عمده پیراهن مردانه — ۵۰ عدد"
          className="h-11"
          maxLength={120}
        />
        {errors.title ? (
          <p role="alert" className="text-destructive text-sm">
            {errors.title}
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">
            عنوانی واضح با جنس و تعداد — خریدار عمده با یک نگاه باید بداند چه می‌بیند.
          </p>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="lot-description">توضیحات</Label>
        <textarea
          id="lot-description"
          value={value.description}
          onChange={(event) => onChange({ description: event.target.value })}
          aria-invalid={Boolean(errors.description) || undefined}
          placeholder="جنس، سایزبندی، رنگ‌ها، بسته‌بندی و شرایط تحویل را توضیح دهید"
          rows={6}
          maxLength={5000}
          className="border-input bg-background text-foreground min-h-11 w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
        />
        {errors.description ? (
          <p role="alert" className="text-destructive text-sm">
            {errors.description}
          </p>
        ) : null}
      </div>
    </div>
  );
}
