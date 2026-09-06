'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { IRAN_PROVINCES, findIranProvince } from '@/lib/iran-geo';

export interface IdentityValue {
  displayName: string;
  businessName: string;
  province: string;
  city: string;
}

export interface IdentityErrors {
  displayName?: string | undefined;
  businessName?: string | undefined;
  province?: string | undefined;
  city?: string | undefined;
}

/** Step 2 — identity: display name, business name (sellers), province + city. */
export interface StepIdentityProps {
  value: IdentityValue;
  errors: IdentityErrors;
  isSeller: boolean;
  onChange: (patch: Partial<IdentityValue>) => void;
}

export function StepIdentity({ value, errors, isSeller, onChange }: StepIdentityProps) {
  const cities = value.province ? (findIranProvince(value.province)?.cities ?? []) : [];

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="onboarding-display-name">نام نمایشی</Label>
        <Input
          id="onboarding-display-name"
          value={value.displayName}
          onChange={(event) => onChange({ displayName: event.target.value })}
          aria-invalid={Boolean(errors.displayName) || undefined}
          placeholder="مثلاً مینا رضایی"
          autoComplete="name"
          className="h-11"
        />
        {errors.displayName ? (
          <p role="alert" className="text-destructive text-sm">
            {errors.displayName}
          </p>
        ) : null}
      </div>

      {isSeller ? (
        <div className="grid gap-2">
          <Label htmlFor="onboarding-business-name">نام کسب‌وکار</Label>
          <Input
            id="onboarding-business-name"
            value={value.businessName}
            onChange={(event) => onChange({ businessName: event.target.value })}
            aria-invalid={Boolean(errors.businessName) || undefined}
            placeholder="مثلاً تولیدی پوشاک مینا"
            className="h-11"
          />
          {errors.businessName ? (
            <p role="alert" className="text-destructive text-sm">
              {errors.businessName}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="onboarding-province">استان</Label>
          <select
            id="onboarding-province"
            value={value.province}
            onChange={(event) => onChange({ province: event.target.value, city: '' })}
            aria-invalid={Boolean(errors.province) || undefined}
            className="border-input bg-background text-foreground h-11 w-full rounded-md border px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          >
            <option value="">انتخاب استان</option>
            {IRAN_PROVINCES.map((province) => (
              <option key={province.slug} value={province.slug}>
                {province.nameFa}
              </option>
            ))}
          </select>
          {errors.province ? (
            <p role="alert" className="text-destructive text-sm">
              {errors.province}
            </p>
          ) : null}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="onboarding-city">شهر</Label>
          <select
            id="onboarding-city"
            value={value.city}
            onChange={(event) => onChange({ city: event.target.value })}
            aria-invalid={Boolean(errors.city) || undefined}
            disabled={!value.province}
            className="border-input bg-background text-foreground h-11 w-full rounded-md border px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:opacity-50"
          >
            <option value="">{value.province ? 'انتخاب شهر' : 'ابتدا استان'}</option>
            {cities.map((city) => (
              <option key={city.slug} value={city.slug}>
                {city.nameFa}
              </option>
            ))}
          </select>
          {errors.city ? (
            <p role="alert" className="text-destructive text-sm">
              {errors.city}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
