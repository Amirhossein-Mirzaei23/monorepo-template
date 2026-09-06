'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatFaDigits } from '@/lib/format';
import type { LotUnit, PricingType } from '@monorepo/shared-types';
import {
  LOT_UNITS,
  PRICING_TYPES,
  LOT_UNIT_LABELS_FA,
  PRICING_TYPE_LABELS_FA,
} from '../../schemas/lot-schema';
import { UnitPricePreview } from '../unit-price-preview';

/** Raw field state — numbers stay strings while typing; '' = not chosen yet. */
export interface PricingValue {
  totalPrice: string;
  quantity: string;
  unit: LotUnit | '';
  availableQuantity: string;
  minOrderQuantity: string;
  pricingType: PricingType | '';
}

export type PricingField = keyof PricingValue;

export interface StepPricingProps {
  value: PricingValue;
  errors: Partial<Record<PricingField, string | undefined>>;
  onChange: (patch: Partial<PricingValue>) => void;
  disabled?: boolean;
}

const numberInputClass = 'h-11';
const selectClass =
  'border-input bg-background text-foreground h-11 w-full rounded-md border px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:opacity-50';

/**
 * Wizard step 3 — price and quantity of the wholesale batch: total price,
 * quantity/unit, availability/minimum-order, pricing type and the live
 * unit-price preview («قیمت هر واحد: ~۲۲٬۵۰۰ تومان», mirroring the API's
 * derived unitPrice). Also the single editable surface for listed
 * (ACTIVE/PAUSED) lots in edit mode.
 */
export function StepPricing({ value, errors, onChange, disabled = false }: StepPricingProps) {
  const totalPrice = Number(value.totalPrice);
  const quantity = Number(value.quantity);

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="lot-total-price">قیمت کل (تومان)</Label>
        <Input
          id="lot-total-price"
          type="number"
          inputMode="numeric"
          min={1}
          max={2000000000}
          disabled={disabled}
          value={value.totalPrice}
          onChange={(event) => onChange({ totalPrice: event.target.value })}
          aria-invalid={Boolean(errors.totalPrice) || undefined}
          placeholder="مثلاً ۱۱۲۵۰۰۰۰۰"
          className={numberInputClass}
        />
        {errors.totalPrice ? (
          <p role="alert" className="text-destructive text-sm">
            {errors.totalPrice}
          </p>
        ) : null}
        <UnitPricePreview totalPrice={totalPrice} quantity={quantity} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="lot-quantity">تعداد کل</Label>
          <Input
            id="lot-quantity"
            type="number"
            inputMode="numeric"
            min={1}
            disabled={disabled}
            value={value.quantity}
            onChange={(event) => onChange({ quantity: event.target.value })}
            aria-invalid={Boolean(errors.quantity) || undefined}
            placeholder="۵۰"
            className={numberInputClass}
          />
          {errors.quantity ? (
            <p role="alert" className="text-destructive text-sm">
              {errors.quantity}
            </p>
          ) : null}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="lot-unit">واحد</Label>
          <select
            id="lot-unit"
            value={value.unit}
            disabled={disabled}
            onChange={(event) => onChange({ unit: event.target.value as PricingValue['unit'] })}
            aria-invalid={Boolean(errors.unit) || undefined}
            className={selectClass}
          >
            {LOT_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {LOT_UNIT_LABELS_FA[unit]}
              </option>
            ))}
          </select>
          {errors.unit ? (
            <p role="alert" className="text-destructive text-sm">
              {errors.unit}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="lot-available">موجودی قابل فروش</Label>
          <Input
            id="lot-available"
            type="number"
            inputMode="numeric"
            min={0}
            disabled={disabled}
            value={value.availableQuantity}
            onChange={(event) => onChange({ availableQuantity: event.target.value })}
            aria-invalid={Boolean(errors.availableQuantity) || undefined}
            placeholder={
              value.quantity !== '' ? `تا ${formatFaDigits(value.quantity)}` : 'مثلاً ۴۵'
            }
            className={numberInputClass}
          />
          {errors.availableQuantity ? (
            <p role="alert" className="text-destructive text-sm">
              {errors.availableQuantity}
            </p>
          ) : null}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="lot-min-order">حداقل سفارش</Label>
          <Input
            id="lot-min-order"
            type="number"
            inputMode="numeric"
            min={1}
            disabled={disabled}
            value={value.minOrderQuantity}
            onChange={(event) => onChange({ minOrderQuantity: event.target.value })}
            aria-invalid={Boolean(errors.minOrderQuantity) || undefined}
            placeholder="۱۰"
            className={numberInputClass}
          />
          {errors.minOrderQuantity ? (
            <p role="alert" className="text-destructive text-sm">
              {errors.minOrderQuantity}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="lot-pricing-type">نوع قیمت‌گذاری</Label>
        <select
          id="lot-pricing-type"
          value={value.pricingType}
          disabled={disabled}
          onChange={(event) =>
            onChange({ pricingType: event.target.value as PricingValue['pricingType'] })
          }
          aria-invalid={Boolean(errors.pricingType) || undefined}
          className={selectClass}
        >
          {PRICING_TYPES.map((type) => (
            <option key={type} value={type}>
              {PRICING_TYPE_LABELS_FA[type]}
            </option>
          ))}
        </select>
        {errors.pricingType ? (
          <p role="alert" className="text-destructive text-sm">
            {errors.pricingType}
          </p>
        ) : null}
      </div>
    </div>
  );
}
