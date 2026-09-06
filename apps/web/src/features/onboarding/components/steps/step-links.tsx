'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface LinksValue {
  instagram: string;
  website: string;
}

export interface LinksErrors {
  instagram?: string | undefined;
  website?: string | undefined;
}

/** Step 5 — optional links: instagram handle + website. */
export interface StepLinksProps {
  value: LinksValue;
  errors: LinksErrors;
  onChange: (patch: Partial<LinksValue>) => void;
}

export function StepLinks({ value, errors, onChange }: StepLinksProps) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="onboarding-instagram">اینستاگرام (اختیاری)</Label>
        <Input
          id="onboarding-instagram"
          value={value.instagram}
          onChange={(event) => onChange({ instagram: event.target.value })}
          aria-invalid={Boolean(errors.instagram) || undefined}
          placeholder="mina.apparel"
          dir="ltr"
          className="h-11 text-start"
          autoComplete="off"
        />
        {errors.instagram ? (
          <p role="alert" className="text-destructive text-sm">
            {errors.instagram}
          </p>
        ) : null}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="onboarding-website">وب‌سایت (اختیاری)</Label>
        <Input
          id="onboarding-website"
          type="url"
          value={value.website}
          onChange={(event) => onChange({ website: event.target.value })}
          aria-invalid={Boolean(errors.website) || undefined}
          placeholder="https://mina-apparel.ir"
          dir="ltr"
          className="h-11 text-start"
          autoComplete="url"
        />
        {errors.website ? (
          <p role="alert" className="text-destructive text-sm">
            {errors.website}
          </p>
        ) : null}
      </div>
    </div>
  );
}
