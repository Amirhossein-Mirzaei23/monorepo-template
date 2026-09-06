'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CategoryTreePicker } from '@/features/categories';
import { IRAN_PROVINCES, findIranProvince } from '@/lib/iran-geo';
import type { LiquidationReason, LotCondition } from '@monorepo/shared-types';
import {
  LIQUIDATION_REASONS,
  LOT_CONDITIONS,
  LIQUIDATION_REASON_LABELS_FA,
  LOT_CONDITION_LABELS_FA,
} from '../../schemas/lot-schema';

/** Raw field state — '' = not chosen yet for the select fields. */
export interface ClassificationValue {
  categoryId: string;
  subcategoryId: string;
  condition: LotCondition | '';
  liquidationReason: LiquidationReason | '';
  province: string;
  city: string;
  locationHint: string;
  exactAddress: string;
}

export type ClassificationField = keyof ClassificationValue;

export interface StepClassificationProps {
  value: ClassificationValue;
  errors: Partial<Record<ClassificationField, string | undefined>>;
  onChange: (patch: Partial<ClassificationValue>) => void;
  disabled?: boolean;
}

const selectClass =
  'border-input bg-background text-foreground h-11 w-full rounded-md border px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:opacity-50';

/**
 * Wizard step 4 — classification + location: shared CategoryTreePicker
 * (CAT-003, reused via barrel), condition/liquidation-reason selects (fa
 * labels), cascading province/city geo selects, the PUBLIC area hint and the
 * PRIVATE exact address (owner-only; released after a deal — plan R7).
 */
export function StepClassification({
  value,
  errors,
  onChange,
  disabled = false,
}: StepClassificationProps) {
  const cities = value.province ? (findIranProvince(value.province)?.cities ?? []) : [];

  return (
    <div className="grid gap-4">
      <CategoryTreePicker
        value={{
          parentId: value.categoryId || undefined,
          childId: value.subcategoryId || undefined,
        }}
        onChange={(next) =>
          onChange({ categoryId: next.parentId ?? '', subcategoryId: next.childId ?? '' })
        }
        disabled={disabled}
      />
      {errors.categoryId ? (
        <p role="alert" className="text-destructive -mt-2 text-sm">
          {errors.categoryId}
        </p>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor="lot-condition">وضعیت کالا</Label>
        <select
          id="lot-condition"
          value={value.condition ?? ''}
          disabled={disabled}
          onChange={(event) =>
            onChange({ condition: event.target.value as ClassificationValue['condition'] })
          }
          aria-invalid={Boolean(errors.condition) || undefined}
          className={selectClass}
        >
          <option value="">انتخاب وضعیت</option>
          {LOT_CONDITIONS.map((condition) => (
            <option key={condition} value={condition}>
              {LOT_CONDITION_LABELS_FA[condition]}
            </option>
          ))}
        </select>
        {errors.condition ? (
          <p role="alert" className="text-destructive text-sm">
            {errors.condition}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="lot-reason">دلیل این فروش</Label>
        <select
          id="lot-reason"
          value={value.liquidationReason ?? ''}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              liquidationReason: event.target.value as ClassificationValue['liquidationReason'],
            })
          }
          aria-invalid={Boolean(errors.liquidationReason) || undefined}
          className={selectClass}
        >
          <option value="">انتخاب دلیل</option>
          {LIQUIDATION_REASONS.map((reason) => (
            <option key={reason} value={reason}>
              {LIQUIDATION_REASON_LABELS_FA[reason]}
            </option>
          ))}
        </select>
        {errors.liquidationReason ? (
          <p role="alert" className="text-destructive text-sm">
            {errors.liquidationReason}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="lot-province">استان</Label>
          <select
            id="lot-province"
            value={value.province}
            disabled={disabled}
            onChange={(event) => onChange({ province: event.target.value, city: '' })}
            aria-invalid={Boolean(errors.province) || undefined}
            className={selectClass}
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
          <Label htmlFor="lot-city">شهر</Label>
          <select
            id="lot-city"
            value={value.city}
            disabled={disabled || !value.province}
            onChange={(event) => onChange({ city: event.target.value })}
            aria-invalid={Boolean(errors.city) || undefined}
            className={selectClass}
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

      <div className="grid gap-2">
        <Label htmlFor="lot-location-hint">موقعیت تقریبی (اختیاری)</Label>
        <Input
          id="lot-location-hint"
          value={value.locationHint ?? ''}
          disabled={disabled}
          onChange={(event) => onChange({ locationHint: event.target.value })}
          aria-invalid={Boolean(errors.locationHint) || undefined}
          placeholder="مثلاً بازار بزرگ تهران"
          maxLength={100}
          className="h-11"
        />
        <p className="text-muted-foreground text-xs">
          فقط منطقه تقریبی — آدرس دقیق بعد از معامله منتشر می‌شود.
        </p>
        {errors.locationHint ? (
          <p role="alert" className="text-destructive text-sm">
            {errors.locationHint}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="lot-exact-address">نشانی دقیق (اختیاری)</Label>
          <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[11px]">
            خصوصی
          </span>
        </div>
        <Input
          id="lot-exact-address"
          value={value.exactAddress ?? ''}
          disabled={disabled}
          onChange={(event) => onChange({ exactAddress: event.target.value })}
          aria-invalid={Boolean(errors.exactAddress) || undefined}
          placeholder="تهران، خیابان …، پلاک ۱۲"
          maxLength={300}
          className="h-11"
        />
        <p className="text-muted-foreground text-xs">
          فقط برای خودتان ثبت می‌شود و هرگز در آگهی نمایش داده نمی‌شود.
        </p>
        {errors.exactAddress ? (
          <p role="alert" className="text-destructive text-sm">
            {errors.exactAddress}
          </p>
        ) : null}
      </div>
    </div>
  );
}
