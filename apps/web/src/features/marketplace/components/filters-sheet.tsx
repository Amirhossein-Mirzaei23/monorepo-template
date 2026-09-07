'use client';

import { useId, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SlidersHorizontal } from 'lucide-react';
import type { LotCondition, LiquidationReason } from '@monorepo/shared-types';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CategoryTreePicker } from '@/features/categories';
import { cn } from '@/lib/utils';
import { formatFaDigits } from '@/lib/format';
import { IRAN_PROVINCES, findIranProvince } from '@/lib/iran-geo';
import {
  LIQUIDATION_REASONS,
  LOT_CONDITIONS,
  LOTS_LISTED_WITHIN_OPTIONS,
  parseLotsBrowseParams,
  PRICING_TYPES,
  type LotsBrowseFilter,
} from '../schemas/browse-query';
import {
  browseHref,
  commitFiltersToParams,
  filtersFormSchema,
  formValuesFromFilter,
  type FiltersFormValues,
} from '../schemas/filters-schema';
import {
  LIQUIDATION_REASON_LABELS_FA,
  LISTED_WITHIN_LABELS_FA,
  LOT_CONDITION_LABELS_FA,
  PRICING_TYPE_LABELS_FA,
} from './labels';

/**
 * MKT-008 — the filter panel: a bottom sheet on mobile, a start-docked sidebar
 * panel on ≥md (components/ui/sheet.tsx handles both presentations + the a11y
 * mechanics: focus trap, Escape, overlay close, focus restore).
 *
 * Apply/reset semantics (card): the panel edits a LOCAL DRAFT seeded from the
 * URL on open; «اعمال» commits it to the URL (filter params REPLACED — q/sort
 * survive), «حذف فیلترها» clears the filter params (q/sort kept). Param names
 * and serialization are the API contract (schemas/browse-query.ts via
 * schemas/filters-schema.ts), so filter→URL→reload reproduces exactly.
 *
 * The draft lives in `FiltersSheetPanel`, which is MOUNTED ONLY while the
 * sheet is open — its lazy useState seeds from the URL, so every open starts
 * from the current deep-link state with no effect-based reseeding.
 *
 * On /c/{slug} landing pages (`hideCategory`) the category cascade is hidden
 * and category params are never written — the page scope owns the category.
 * Counts (per-filter result counts) are explicitly not in the MVP (card).
 */
export interface FiltersSheetProps {
  /** Category landing page: lock the category scope (hide the cascade). */
  hideCategory?: boolean;
}

/** Number of set filter params — the badge on the «فیلترها» trigger. */
function countActiveFilters(filter: LotsBrowseFilter): number {
  let count = 0;
  if (filter.categoryId) count += 1;
  if (filter.subcategoryId) count += 1;
  if (filter.priceMin !== undefined) count += 1;
  if (filter.priceMax !== undefined) count += 1;
  if (filter.qtyMin !== undefined) count += 1;
  if (filter.qtyMax !== undefined) count += 1;
  if (filter.province) count += 1;
  if (filter.city) count += 1;
  count += filter.condition?.length ?? 0;
  if (filter.pricingType) count += 1;
  count += filter.liquidationReason?.length ?? 0;
  if (filter.listedWithin) count += 1;
  return count;
}

/** Multi/single-select chip with a ≥44px touch target and aria-pressed state. */
function ToggleChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'min-h-11 rounded-full border px-4 text-sm transition-colors',
        active
          ? 'border-primary bg-primary/10 font-medium text-primary'
          : 'border-border text-muted-foreground hover:bg-accent',
      )}
    >
      {children}
    </button>
  );
}

const selectClass =
  'border-input bg-background text-foreground h-11 w-full appearance-none rounded-md border px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:opacity-50';

export function FiltersSheet({ hideCategory = false }: FiltersSheetProps) {
  const [open, setOpen] = useState(false);
  const searchParams = useSearchParams();
  const activeCount = countActiveFilters(parseLotsBrowseParams(searchParams));

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-11 gap-2 rounded-xl"
        onClick={() => setOpen(true)}
      >
        <SlidersHorizontal className="size-4" aria-hidden="true" />
        فیلترها
        {activeCount > 0 ? (
          <span className="bg-primary text-primary-foreground grid size-5 place-items-center rounded-full text-[11px] leading-none">
            {formatFaDigits(activeCount)}
          </span>
        ) : null}
      </Button>

      {open ? (
        <FiltersSheetPanel
          hideCategory={hideCategory}
          searchParams={searchParams}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

interface FiltersSheetPanelProps {
  hideCategory: boolean;
  searchParams: URLSearchParams;
  /** Closes the sheet (apply, reset, Escape, overlay, close button). */
  onClose: () => void;
}

/**
 * The open sheet: draft state + the URL-committing actions. Mounted fresh on
 * every open, so the lazy initializer IS the URL→form seed (the URL is the
 * single source of truth; deep links reproduce in the panel).
 */
function FiltersSheetPanel({ hideCategory, searchParams, onClose }: FiltersSheetPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const id = useId();
  const [values, setValues] = useState<FiltersFormValues>(() => {
    const seeded = formValuesFromFilter(parseLotsBrowseParams(searchParams));
    return hideCategory ? { ...seeded, categoryId: '', subcategoryId: '' } : seeded;
  });
  const [errors, setErrors] = useState<string[]>([]);

  const patch = (next: Partial<FiltersFormValues>) => {
    setValues((previous) => ({ ...previous, ...next }));
  };

  const onApply = () => {
    const parsed = filtersFormSchema.safeParse(values);
    if (!parsed.success) {
      // Invalid drafts never reach the URL (card: «invalid input blocked client-side»).
      setErrors([...new Set(parsed.error.issues.map((issue) => issue.message))]);
      return;
    }
    const filter: LotsBrowseFilter = hideCategory
      ? { ...parsed.data, categoryId: undefined, subcategoryId: undefined }
      : parsed.data;
    router.push(browseHref(pathname, commitFiltersToParams(searchParams, filter)));
    onClose();
  };

  const onReset = () => {
    router.push(browseHref(pathname, commitFiltersToParams(searchParams, null)));
    onClose();
  };

  const toggleCondition = (condition: LotCondition) => {
    patch({
      condition: values.condition.includes(condition)
        ? values.condition.filter((entry) => entry !== condition)
        : [...values.condition, condition],
    });
  };

  const toggleReason = (reason: LiquidationReason) => {
    patch({
      liquidationReason: values.liquidationReason.includes(reason)
        ? values.liquidationReason.filter((entry) => entry !== reason)
        : [...values.liquidationReason, reason],
    });
  };

  const cities = values.province ? (findIranProvince(values.province)?.cities ?? []) : [];

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
      title="فیلترها"
      footer={
        <div>
          {errors.length > 0 ? (
            <div role="alert" className="mb-3 grid gap-1">
              {errors.map((message) => (
                <p key={message} className="text-destructive text-xs">
                  {message}
                </p>
              ))}
            </div>
          ) : null}
          <div className="flex gap-3">
            <Button type="button" variant="outline" className="h-12 flex-1" onClick={onReset}>
              حذف فیلترها
            </Button>
            <Button type="button" className="h-12 flex-[2]" onClick={onApply}>
              اعمال
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid gap-6 p-4">
        {/* verifiedSeller toggle: the API param exists (MKT-002) but its EXISTS
            query ships with TRS-001 (Phase 7) — the toggle stays HIDDEN until
            then (card). Wire a ToggleChip to `verifiedSeller` here when it lands. */}

        {!hideCategory ? (
          <div>
            <CategoryTreePicker
              value={{
                parentId: values.categoryId || undefined,
                childId: values.subcategoryId || undefined,
              }}
              onChange={(next) =>
                patch({
                  categoryId: next.parentId ?? '',
                  subcategoryId: next.childId ?? '',
                })
              }
            />
          </div>
        ) : null}

        <section className="grid gap-2" aria-label="محدوده قیمت">
          <span className="text-sm font-medium">محدوده قیمت</span>
          <div className="grid grid-cols-2 gap-3">
            <div className="relative">
              <label htmlFor={`${id}-price-min`} className="sr-only">
                حداقل قیمت (تومان)
              </label>
              <Input
                id={`${id}-price-min`}
                inputMode="numeric"
                autoComplete="off"
                placeholder="از"
                value={values.priceMin}
                onChange={(event) => patch({ priceMin: event.target.value })}
                className="h-11 pe-14"
              />
              <span
                aria-hidden="true"
                className="text-muted-foreground pointer-events-none absolute inset-y-0 end-3 my-auto flex items-center text-xs"
              >
                تومان
              </span>
            </div>
            <div className="relative">
              <label htmlFor={`${id}-price-max`} className="sr-only">
                حداکثر قیمت (تومان)
              </label>
              <Input
                id={`${id}-price-max`}
                inputMode="numeric"
                autoComplete="off"
                placeholder="تا"
                value={values.priceMax}
                onChange={(event) => patch({ priceMax: event.target.value })}
                className="h-11 pe-14"
              />
              <span
                aria-hidden="true"
                className="text-muted-foreground pointer-events-none absolute inset-y-0 end-3 my-auto flex items-center text-xs"
              >
                تومان
              </span>
            </div>
          </div>
          <p className="text-muted-foreground text-xs">
            مبلغ به تومان — اعداد فارسی هم پذیرفته می‌شود.
          </p>
        </section>

        <section className="grid gap-2" aria-label="محدوده موجودی">
          <span className="text-sm font-medium">محدوده موجودی</span>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${id}-qty-min`} className="sr-only">
                حداقل موجودی
              </label>
              <Input
                id={`${id}-qty-min`}
                inputMode="numeric"
                autoComplete="off"
                placeholder="از"
                value={values.qtyMin}
                onChange={(event) => patch({ qtyMin: event.target.value })}
                className="h-11"
              />
            </div>
            <div>
              <label htmlFor={`${id}-qty-max`} className="sr-only">
                حداکثر موجودی
              </label>
              <Input
                id={`${id}-qty-max`}
                inputMode="numeric"
                autoComplete="off"
                placeholder="تا"
                value={values.qtyMax}
                onChange={(event) => patch({ qtyMax: event.target.value })}
                className="h-11"
              />
            </div>
          </div>
        </section>

        <section className="grid gap-2" aria-label="موقعیت">
          <span className="text-sm font-medium">موقعیت</span>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <label htmlFor={`${id}-province`} className="sr-only">
                استان
              </label>
              <select
                id={`${id}-province`}
                value={values.province}
                onChange={(event) => patch({ province: event.target.value, city: '' })}
                className={selectClass}
              >
                <option value="">همه استان‌ها</option>
                {IRAN_PROVINCES.map((province) => (
                  <option key={province.slug} value={province.slug}>
                    {province.nameFa}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <label htmlFor={`${id}-city`} className="sr-only">
                شهر
              </label>
              <select
                id={`${id}-city`}
                value={values.city}
                disabled={!values.province}
                onChange={(event) => patch({ city: event.target.value })}
                className={selectClass}
              >
                <option value="">{values.province ? 'همه شهرها' : 'ابتدا استان'}</option>
                {cities.map((city) => (
                  <option key={city.slug} value={city.slug}>
                    {city.nameFa}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="grid gap-2" aria-label="وضعیت کالا">
          <span className="text-sm font-medium">وضعیت کالا</span>
          <div className="flex flex-wrap gap-2">
            {LOT_CONDITIONS.map((condition) => (
              <ToggleChip
                key={condition}
                active={values.condition.includes(condition)}
                onClick={() => toggleCondition(condition)}
              >
                {LOT_CONDITION_LABELS_FA[condition]}
              </ToggleChip>
            ))}
          </div>
        </section>

        <section className="grid gap-2" aria-label="نوع قیمت‌گذاری">
          <span className="text-sm font-medium">نوع قیمت‌گذاری</span>
          <label htmlFor={`${id}-pricing-type`} className="sr-only">
            نوع قیمت‌گذاری
          </label>
          <select
            id={`${id}-pricing-type`}
            value={values.pricingType}
            onChange={(event) => patch({ pricingType: event.target.value })}
            className={selectClass}
          >
            <option value="">همه</option>
            {PRICING_TYPES.map((pricingType) => (
              <option key={pricingType} value={pricingType}>
                {PRICING_TYPE_LABELS_FA[pricingType]}
              </option>
            ))}
          </select>
        </section>

        <section className="grid gap-2" aria-label="دلیل فروش">
          <span className="text-sm font-medium">دلیل فروش</span>
          <div className="flex flex-wrap gap-2">
            {LIQUIDATION_REASONS.map((reason) => (
              <ToggleChip
                key={reason}
                active={values.liquidationReason.includes(reason)}
                onClick={() => toggleReason(reason)}
              >
                {LIQUIDATION_REASON_LABELS_FA[reason]}
              </ToggleChip>
            ))}
          </div>
        </section>

        <section className="grid gap-2" aria-label="تازگی آگهی">
          <span className="text-sm font-medium">تازگی آگهی</span>
          <div className="flex flex-wrap gap-2">
            {LOTS_LISTED_WITHIN_OPTIONS.map((option) => (
              <ToggleChip
                key={option}
                active={values.listedWithin === option}
                onClick={() =>
                  patch({ listedWithin: values.listedWithin === option ? '' : option })
                }
              >
                {LISTED_WITHIN_LABELS_FA[option]}
              </ToggleChip>
            ))}
          </div>
        </section>
      </div>
    </Sheet>
  );
}
