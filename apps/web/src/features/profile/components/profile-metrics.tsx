'use client';

import type { ProfileMetricsDto } from '@monorepo/shared-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatFaDigits } from '@/lib/format';

/** null/undefined render «—» — the honest placeholder until the P1 metrics jobs land. */
function metricValue(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : formatFaDigits(value);
}

/** Optional metric fields (rating/response/cancellation) read as nullable. */
type MetricKey = keyof ProfileMetricsDto & string;

const METRIC_ROWS: Array<{ key: MetricKey; labelFa: string }> = [
  { key: 'successfulTransactions', labelFa: 'معاملات موفق' },
  { key: 'averageRating', labelFa: 'میانگین امتیاز' },
  { key: 'ratingCount', labelFa: 'تعداد امتیازها' },
  { key: 'responseRateMinutes', labelFa: 'زمان پاسخ‌دهی (دقیقه)' },
  { key: 'cancellationRate', labelFa: 'نرخ لغو' },
  { key: 'activeListings', labelFa: 'آگهی‌های فعال' },
];

/**
 * Read-only trust metrics strip (PROF-001) — placeholders only: counts show ۰
 * and averages/rates show «—» until the P1 rollup job (PROF-005) and reviews
 * land. The layout mirrors the public seller profile (PROF-002) on purpose.
 */
export function ProfileMetrics({ metrics }: { metrics: ProfileMetricsDto }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>شاخص‌های اعتماد</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          {METRIC_ROWS.map(({ key, labelFa }) => (
            <div
              key={key}
              className="flex items-baseline justify-between gap-2 border-b border-dashed border-border pb-2"
            >
              <dt className="text-muted-foreground text-sm">{labelFa}</dt>
              <dd className="text-foreground font-semibold tabular-nums">
                {metricValue(metrics[key])}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-muted-foreground mt-3 text-xs">
          این شاخص‌ها پس از نخستین معاملات و نظرات فعال می‌شوند.
        </p>
      </CardContent>
    </Card>
  );
}
