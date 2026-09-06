'use client';

import { formatToman } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface UnitPricePreviewProps {
  /** Total price in whole Toman (form value; may be NaN/0 while typing). */
  totalPrice: number;
  /** Batch quantity (form value; may be NaN/0 while typing). */
  quantity: number;
  className?: string;
}

/**
 * Live unit-price hint (LOT-004 pricing step): mirrors the API's derived
 * `unitPrice = round(totalPrice / quantity)` so the seller sees the per-unit
 * economics while typing — «قیمت هر واحد: ~۲۲٬۵۰۰ تومان» (ui-patterns price
 * hierarchy). Renders nothing until both inputs are valid.
 */
export function UnitPricePreview({ totalPrice, quantity, className }: UnitPricePreviewProps) {
  if (!Number.isFinite(totalPrice) || !Number.isFinite(quantity)) {
    return null;
  }
  if (totalPrice < 1 || quantity < 1) {
    return null;
  }
  return (
    <p
      className={cn('text-primary text-sm font-medium', className)}
      aria-live="polite"
      data-testid="unit-price-preview"
    >
      قیمت هر واحد: ~{formatToman(Math.round(totalPrice / quantity))}
    </p>
  );
}
