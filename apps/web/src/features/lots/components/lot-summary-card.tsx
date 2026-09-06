'use client';

import { Card, CardContent } from '@/components/ui/card';
import { formatFaDigits, formatToman } from '@/lib/format';
import { findIranCity, findIranProvince } from '@/lib/iran-geo';
import type { MediaItem } from '@/features/media';
import {
  LIQUIDATION_REASON_LABELS_FA,
  LOT_CONDITION_LABELS_FA,
  LOT_UNIT_LABELS_FA,
  PRICING_TYPE_LABELS_FA,
  type LotFormData,
} from '../schemas/lot-schema';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-start font-medium">{value}</dd>
    </div>
  );
}

export interface LotSummaryCardProps {
  /** Fully valid form data (the review step only renders valid slices). */
  data: LotFormData;
  /** Ready gallery tiles (cover first) — rendered as a static thumb strip. */
  media?: MediaItem[];
  /** «پوشاک › مردانه» — resolved by the caller from the category tree. */
  categoryLabel?: string;
  className?: string;
}

/**
 * Review-step summary card (LOT-004) — the lot as buyers will see it: static
 * media thumbs, title/description, price hierarchy (total + per-unit), batch
 * numbers, classification and location. Also reused as the read-only view for
 * locked statuses in edit mode (unlike MediaGrid it has no action buttons).
 */
export function LotSummaryCard({ data, media, categoryLabel, className }: LotSummaryCardProps) {
  const provinceName = findIranProvince(data.province)?.nameFa ?? data.province;
  const cityName = findIranCity(data.province, data.city)?.nameFa ?? data.city;
  const readyMedia = (media ?? []).filter((item) => item.status === 'ready');
  const unitPrice =
    data.quantity >= 1 ? Math.round(data.totalPrice / data.quantity) : data.totalPrice;

  return (
    <Card className={className}>
      <CardContent className="grid gap-4">
        {readyMedia.length > 0 ? (
          <div role="list" aria-label="رسانه‌های لات" className="grid grid-cols-3 gap-2">
            {readyMedia.map((item, index) => (
              <div
                key={item.key}
                role="listitem"
                className="bg-muted relative aspect-square overflow-hidden rounded-xl border"
              >
                {item.kind === 'image' || item.thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- dynamic media URLs (media origin), next/image optimization not applicable
                  <img
                    src={item.thumbUrl ?? item.url}
                    alt={`${item.kind === 'image' ? 'تصویر' : 'پوستر ویدیو'} ${formatFaDigits(index + 1)}`}
                    className="size-full object-cover"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="text-muted-foreground absolute inset-0 flex items-center justify-center text-xs"
                  >
                    ویدیو
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : null}

        <div className="grid gap-2">
          <h3 className="text-foreground text-base font-semibold">{data.title}</h3>
          {data.description ? (
            <p className="text-muted-foreground text-sm whitespace-pre-line">{data.description}</p>
          ) : null}
        </div>

        <dl className="grid gap-2">
          <Row label="قیمت کل" value={formatToman(data.totalPrice)} />
          <Row
            label="قیمت هر واحد"
            value={`~${formatToman(unitPrice)} / ${LOT_UNIT_LABELS_FA[data.unit]}`}
          />
          <Row
            label="تعداد"
            value={`${formatFaDigits(data.quantity)} ${LOT_UNIT_LABELS_FA[data.unit]}`}
          />
          <Row
            label="موجودی قابل فروش"
            value={formatFaDigits(data.availableQuantity ?? data.quantity)}
          />
          <Row label="حداقل سفارش" value={formatFaDigits(data.minOrderQuantity ?? 1)} />
          <Row label="قیمت‌گذاری" value={PRICING_TYPE_LABELS_FA[data.pricingType]} />
          {categoryLabel ? <Row label="دسته‌بندی" value={categoryLabel} /> : null}
          <Row label="وضعیت کالا" value={LOT_CONDITION_LABELS_FA[data.condition]} />
          <Row label="دلیل فروش" value={LIQUIDATION_REASON_LABELS_FA[data.liquidationReason]} />
          <Row label="موقعیت" value={`${provinceName}، ${cityName}`} />
          {data.locationHint ? <Row label="موقعیت تقریبی" value={data.locationHint} /> : null}
          {data.exactAddress ? <Row label="نشانی دقیق (خصوصی)" value={data.exactAddress} /> : null}
        </dl>
      </CardContent>
    </Card>
  );
}
