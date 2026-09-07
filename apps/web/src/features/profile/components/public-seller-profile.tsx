import { CalendarDays, MapPin, PackageSearch, Store } from 'lucide-react';
import type { PublicSellerProfileDto } from '@monorepo/shared-types';
import { LotCard, VerifiedBadge } from '@/features/marketplace';
import { formatFaDigits, formatJalali } from '@/lib/format';
import { SellerShareButton } from './seller-share';

/**
 * PROF-002 — the public seller profile view for /s/{id}. Presentational and
 * SERVER-rendered (no 'use client', no fetching — the RSC page hands the
 * payload down): header (businessName ?? displayName, fa city, Jalali member
 * since), badge row (renders empty until TRS-002), trust metrics strip
 * (PROF-005 placeholders: zeros for counters, «—» for the nullable pair), the
 * public bio, the ACTIVE-lot category chips, and the two card grids —
 * «لات‌های فعال» first, then «فروش‌های موفق» — each with its own empty state.
 * No «مشاهده همه» link: the endpoint splits the lots itself (12 + 4) and a
 * seller-filtered browse does not exist in the public query contract yet.
 *
 * Report action: deliberately OMITTED until TRS-004 (see seller-share.tsx —
 * share ships, report waits for its dialog + API).
 *
 * Layout: mobile-first single column at 360px (2-col lot grid), upgraded on
 * ≥md; one accent per view — the share icon button is the only control.
 */

const GRID_CLASSES = 'grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4';

/** null renders «—» — the honest placeholder until PROF-005/reviews land. */
function metricValue(value: number | null): string {
  return value === null ? '—' : formatFaDigits(value);
}

const METRICS: Array<{ key: keyof PublicSellerProfileDto['metrics']; labelFa: string }> = [
  { key: 'successfulTransactions', labelFa: 'معاملات موفق' },
  { key: 'ratingAverage', labelFa: 'میانگین امتیاز' },
  { key: 'ratingCount', labelFa: 'تعداد امتیازها' },
  { key: 'responseRateMinutes', labelFa: 'زمان پاسخ‌دهی (دقیقه)' },
  { key: 'cancellationRate', labelFa: 'نرخ لغو' },
];

function EmptyLots({ message }: { message: string }) {
  return (
    <div className="border-border bg-card grid place-items-center gap-2 rounded-xl border p-6 text-center">
      <div
        className="bg-muted text-zinc-400 flex size-12 items-center justify-center rounded-2xl"
        aria-hidden="true"
      >
        <PackageSearch className="size-6" />
      </div>
      <p className="text-muted-foreground text-sm">{message}</p>
    </div>
  );
}

export interface PublicSellerProfileViewProps {
  seller: PublicSellerProfileDto;
}

export function PublicSellerProfileView({ seller }: PublicSellerProfileViewProps) {
  const displayName = seller.businessName ?? seller.displayName;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      {/* --- header: identity + location + membership + share --- */}
      <section aria-label="پروفایل فروشنده" className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="bg-primary/10 text-primary flex size-14 shrink-0 items-center justify-center rounded-2xl"
        >
          <Store className="size-7" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h1 className="truncate text-lg font-bold">{displayName}</h1>
            {seller.verified ? <VerifiedBadge /> : null}
          </div>
          <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {seller.city ? (
              <span className="flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden="true" />
                {[seller.city, seller.province].filter(Boolean).join('، ')}
              </span>
            ) : null}
            <span className="flex items-center gap-1">
              <CalendarDays className="size-3.5" aria-hidden="true" />
              عضو از {formatJalali(seller.memberSince)}
            </span>
          </p>
          {seller.badges.length > 0 ? (
            <ul aria-label="نشان‌ها" className="mt-2 flex flex-wrap gap-1.5">
              {seller.badges.map((badge) => (
                <li
                  key={badge}
                  className="border-border bg-muted text-zinc-700 rounded-full border px-2.5 py-0.5 text-xs font-medium"
                >
                  {badge}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <SellerShareButton id={seller.id} name={displayName} city={seller.city} />
      </section>

      {/* --- categories of the seller's active lots --- */}
      {seller.categories.length > 0 ? (
        <ul aria-label="دسته‌بندی‌ها" className="mt-4 flex flex-wrap gap-2">
          {seller.categories.map((category) => (
            <li
              key={category.id}
              className="border-border bg-card rounded-full border px-3 py-1 text-xs font-medium"
            >
              {category.nameFa}
            </li>
          ))}
        </ul>
      ) : null}

      {/* --- public bio --- */}
      {seller.bio ? (
        <section aria-label="درباره فروشنده" className="mt-4">
          <h2 className="text-sm font-semibold">درباره</h2>
          <p className="text-muted-foreground mt-1.5 text-sm leading-6">{seller.bio}</p>
        </section>
      ) : null}

      {/* --- trust metrics strip (placeholders until PROF-005) --- */}
      <section aria-label="شاخص‌های اعتماد" className="mt-4">
        <div className="border-border bg-card grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border p-4 sm:grid-cols-3">
          {METRICS.map(({ key, labelFa }) => (
            <div key={key} className="flex items-baseline justify-between gap-2">
              <dt className="text-muted-foreground text-xs">{labelFa}</dt>
              <dd className="text-foreground text-sm font-semibold tabular-nums">
                {metricValue(seller.metrics[key])}
              </dd>
            </div>
          ))}
        </div>
        <p className="text-muted-foreground mt-2 text-xs">
          این شاخص‌ها پس از نخستین معاملات و نظرات فعال می‌شوند.
        </p>
      </section>

      {/* --- active lots (first) --- */}
      <section aria-label="لات‌های فعال" className="mt-6">
        <h2 className="mb-3 text-sm font-semibold">
          لات‌های فعال
          {seller.activeLots.total > 0 ? (
            <span className="text-muted-foreground mr-1.5 text-xs font-normal">
              ({formatFaDigits(seller.activeLots.total)})
            </span>
          ) : null}
        </h2>
        {seller.activeLots.items.length > 0 ? (
          <div className={GRID_CLASSES} data-testid="active-lot-grid">
            {seller.activeLots.items.map((lot) => (
              <LotCard key={lot.id} lot={lot} variant="grid" />
            ))}
          </div>
        ) : (
          <EmptyLots message="این فروشنده هنوز لات فعالی ندارد" />
        )}
      </section>

      {/* --- sold lots («فروش‌های موفق») --- */}
      <section aria-label="فروش‌های موفق" className="mt-6">
        <h2 className="mb-3 text-sm font-semibold">فروش‌های موفق</h2>
        {seller.soldLots.items.length > 0 ? (
          <div className={GRID_CLASSES} data-testid="sold-lot-grid">
            {seller.soldLots.items.map((lot) => (
              <LotCard key={lot.id} lot={lot} variant="grid" />
            ))}
          </div>
        ) : (
          <EmptyLots message="هنوز فروش موفقی ثبت نشده است" />
        )}
      </section>
    </div>
  );
}
