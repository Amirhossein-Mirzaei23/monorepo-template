'use client';

import { Label } from '@/components/ui/label';
import {
  SELLER_BUSINESS_TYPE_LABELS_FA,
  SELLER_BUSINESS_TYPES,
} from '../../schemas/onboarding-schema';

export interface SellerExtrasValue {
  sellerYearsActive: string;
  sellerBusinessType: string;
  sellerDescription: string;
}

export interface SellerExtrasErrors {
  sellerYearsActive?: string | undefined;
  sellerBusinessType?: string | undefined;
  sellerDescription?: string | undefined;
}

/** Step 4 (sellers) — years active, business type, description. */
export interface StepSellerExtrasProps {
  value: SellerExtrasValue;
  errors: SellerExtrasErrors;
  onChange: (patch: Partial<SellerExtrasValue>) => void;
}

export function StepSellerExtras({ value, errors, onChange }: StepSellerExtrasProps) {
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="onboarding-years">سابقه فعالیت (سال)</Label>
          <select
            id="onboarding-years"
            value={value.sellerYearsActive}
            onChange={(event) => onChange({ sellerYearsActive: event.target.value })}
            aria-invalid={Boolean(errors.sellerYearsActive) || undefined}
            className="border-input bg-background text-foreground h-11 w-full rounded-md border px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          >
            <option value="">انتخاب کنید</option>
            {Array.from({ length: 50 }, (_, years) => (
              <option key={years} value={String(years)}>
                {String(years)}
              </option>
            ))}
          </select>
          {errors.sellerYearsActive ? (
            <p role="alert" className="text-destructive text-sm">
              {errors.sellerYearsActive}
            </p>
          ) : null}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="onboarding-business-type">نوع کسب‌وکار</Label>
          <select
            id="onboarding-business-type"
            value={value.sellerBusinessType}
            onChange={(event) => onChange({ sellerBusinessType: event.target.value })}
            aria-invalid={Boolean(errors.sellerBusinessType) || undefined}
            className="border-input bg-background text-foreground h-11 w-full rounded-md border px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          >
            <option value="">انتخاب کنید</option>
            {SELLER_BUSINESS_TYPES.map((type) => (
              <option key={type} value={type}>
                {SELLER_BUSINESS_TYPE_LABELS_FA[type]}
              </option>
            ))}
          </select>
          {errors.sellerBusinessType ? (
            <p role="alert" className="text-destructive text-sm">
              {errors.sellerBusinessType}
            </p>
          ) : null}
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="onboarding-seller-description">معرفی کسب‌وکار (اختیاری)</Label>
        <textarea
          id="onboarding-seller-description"
          value={value.sellerDescription}
          onChange={(event) => onChange({ sellerDescription: event.target.value })}
          aria-invalid={Boolean(errors.sellerDescription) || undefined}
          rows={4}
          placeholder="مثلاً تولیدکننده پوشاک زنانه با ۶ سال سابقه صادرات"
          className="border-input bg-background text-foreground min-h-28 w-full resize-y rounded-md border p-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
        />
        {errors.sellerDescription ? (
          <p role="alert" className="text-destructive text-sm">
            {errors.sellerDescription}
          </p>
        ) : null}
      </div>
    </div>
  );
}
