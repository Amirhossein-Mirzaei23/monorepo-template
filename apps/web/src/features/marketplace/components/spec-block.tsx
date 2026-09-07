import type { LotPublicDetailResponseDto } from '@monorepo/shared-types';
import { formatFaDigits, formatJalali } from '@/lib/format';
import {
  LOT_CONDITION_LABELS_FA,
  LOT_UNIT_LABELS_FA,
  LIQUIDATION_REASON_LABELS_FA,
  PRICING_TYPE_LABELS_FA,
} from './labels';

/**
 * MKT-009 — the lot spec block: labeled rows (dl semantics), every enum
 * rendered through the fa display maps (labels.ts — never hardcoded
 * per-component strings) and numbers/dates through the shared formatters.
 * Rows follow the card's full-spec list: quantity/available/min-order (with
 * the fa unit), condition, liquidation reason, pricing type, category path
 * and the listing expiry (Jalali). Location is NOT a spec row — it renders
 * once under the title as «{شهر} — {regionHint}».
 */
export function SpecBlock({ lot }: { lot: LotPublicDetailResponseDto }) {
  const unit = LOT_UNIT_LABELS_FA[lot.unit];
  const rows: Array<{ term: string; value: string }> = [
    { term: 'تعداد', value: `${formatFaDigits(lot.quantity)} ${unit}` },
    { term: 'موجودی', value: `${formatFaDigits(lot.availableQuantity)} ${unit}` },
    { term: 'حداقل سفارش', value: `${formatFaDigits(lot.minOrderQuantity)} ${unit}` },
    { term: 'وضعیت کالا', value: LOT_CONDITION_LABELS_FA[lot.condition] },
    { term: 'دلیل فروش', value: LIQUIDATION_REASON_LABELS_FA[lot.liquidationReason] },
    { term: 'نوع قیمت', value: PRICING_TYPE_LABELS_FA[lot.pricingType] },
    {
      term: 'دسته‌بندی',
      value: lot.subcategory
        ? `${lot.category.nameFa} ← ${lot.subcategory.nameFa}`
        : lot.category.nameFa,
    },
    { term: 'مهلت فروش', value: formatJalali(lot.expiresAt) },
  ];

  return (
    <dl className="divide-y overflow-hidden rounded-xl border">
      {rows.map((row) => (
        <div key={row.term} className="flex items-center justify-between gap-4 px-3 py-2.5 text-sm">
          <dt className="text-muted-foreground shrink-0">{row.term}</dt>
          <dd className="text-end font-medium">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
