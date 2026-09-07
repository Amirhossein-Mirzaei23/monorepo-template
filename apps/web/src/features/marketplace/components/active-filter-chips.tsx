'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { X } from 'lucide-react';
import type { CategoryTreeNodeDto } from '@monorepo/shared-types';
import { useCategories } from '@/features/categories';
import { formatFaDigits, formatToman } from '@/lib/format';
import { IRAN_PROVINCES, findIranProvince } from '@/lib/iran-geo';
import { parseLotsBrowseParams } from '../schemas/browse-query';
import {
  browseHref,
  commitFiltersToParams,
  removeFilterParamValue,
  type FilterParamKey,
} from '../schemas/filters-schema';
import {
  LIQUIDATION_REASON_LABELS_FA,
  LISTED_WITHIN_LABELS_FA,
  LOT_CONDITION_LABELS_FA,
  PRICING_TYPE_LABELS_FA,
} from './labels';

/**
 * MKT-008 — the active-filter chips row above the browse grid. One chip per
 * active filter VALUE (multi-value filters render one chip per member), each
 * removable INDIVIDUALLY — removal rewrites the URL without touching the other
 * params (array members: only that member is dropped). «حذف همه» is the reset
 * move from the card: filter params cleared, q and sort KEPT (q has its own
 * removable chip). Renders nothing when nothing is active.
 */

interface ActiveFilterChip {
  id: string;
  label: string;
  /** Params (or single array members) this chip's × removes together. */
  removals: ReadonlyArray<{ key: FilterParamKey; value?: string }>;
}

function categoryNameFa(tree: CategoryTreeNodeDto[] | undefined, id: string): string {
  for (const parent of tree ?? []) {
    if (parent.id === id) {
      return parent.nameFa;
    }
    const child = parent.children.find((entry) => entry.id === id);
    if (child) {
      return child.nameFa;
    }
  }
  return id;
}

/** City slugs are globally unique (lib/iran-geo.ts) — resolve the display name. */
function cityNameFa(slug: string): string {
  for (const province of IRAN_PROVINCES) {
    const city = province.cities.find((entry) => entry.slug === slug);
    if (city) {
      return city.nameFa;
    }
  }
  return slug;
}

function buildChips(
  filter: ReturnType<typeof parseLotsBrowseParams>,
  tree: CategoryTreeNodeDto[] | undefined,
): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];

  if (filter.q) {
    chips.push({ id: 'q', label: `جستجو: ${filter.q}`, removals: [{ key: 'q' }] });
  }
  // Removing the parent category takes its child with it (the cascade rule).
  if (filter.categoryId) {
    chips.push({
      id: 'categoryId',
      label: `دسته: ${categoryNameFa(tree, filter.categoryId)}`,
      removals: [{ key: 'categoryId' }, { key: 'subcategoryId' }],
    });
  }
  if (filter.subcategoryId) {
    chips.push({
      id: 'subcategoryId',
      label: `زیر‌دسته: ${categoryNameFa(tree, filter.subcategoryId)}`,
      removals: [{ key: 'subcategoryId' }],
    });
  }
  if (filter.priceMin !== undefined) {
    chips.push({
      id: 'priceMin',
      label: `حداقل قیمت: ${formatToman(filter.priceMin)}`,
      removals: [{ key: 'priceMin' }],
    });
  }
  if (filter.priceMax !== undefined) {
    chips.push({
      id: 'priceMax',
      label: `حداکثر قیمت: ${formatToman(filter.priceMax)}`,
      removals: [{ key: 'priceMax' }],
    });
  }
  if (filter.qtyMin !== undefined) {
    chips.push({
      id: 'qtyMin',
      label: `حداقل موجودی: ${formatFaDigits(filter.qtyMin)}`,
      removals: [{ key: 'qtyMin' }],
    });
  }
  if (filter.qtyMax !== undefined) {
    chips.push({
      id: 'qtyMax',
      label: `حداکثر موجودی: ${formatFaDigits(filter.qtyMax)}`,
      removals: [{ key: 'qtyMax' }],
    });
  }
  // Removing the province takes the (province-scoped) city with it.
  if (filter.province) {
    chips.push({
      id: 'province',
      label: `استان: ${findIranProvince(filter.province)?.nameFa ?? filter.province}`,
      removals: [{ key: 'province' }, { key: 'city' }],
    });
  }
  if (filter.city) {
    chips.push({
      id: 'city',
      label: `شهر: ${cityNameFa(filter.city)}`,
      removals: [{ key: 'city' }],
    });
  }
  for (const condition of filter.condition ?? []) {
    chips.push({
      id: `condition-${condition}`,
      label: LOT_CONDITION_LABELS_FA[condition],
      removals: [{ key: 'condition', value: condition }],
    });
  }
  if (filter.pricingType) {
    chips.push({
      id: 'pricingType',
      label: PRICING_TYPE_LABELS_FA[filter.pricingType],
      removals: [{ key: 'pricingType' }],
    });
  }
  for (const reason of filter.liquidationReason ?? []) {
    chips.push({
      id: `reason-${reason}`,
      label: LIQUIDATION_REASON_LABELS_FA[reason],
      removals: [{ key: 'liquidationReason', value: reason }],
    });
  }
  if (filter.listedWithin) {
    chips.push({
      id: 'listedWithin',
      label: LISTED_WITHIN_LABELS_FA[filter.listedWithin],
      removals: [{ key: 'listedWithin' }],
    });
  }
  return chips;
}

export function ActiveFilterChips() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: tree } = useCategories();

  const filter = parseLotsBrowseParams(searchParams);
  const chips = buildChips(filter, tree);
  if (chips.length === 0) {
    return null;
  }

  const removeChip = (chip: ActiveFilterChip) => {
    let params = new URLSearchParams(searchParams.toString());
    for (const { key, value } of chip.removals) {
      params = removeFilterParamValue(params, key, value);
    }
    router.push(browseHref(pathname, params));
  };

  const removeAll = () => {
    router.push(browseHref(pathname, commitFiltersToParams(searchParams, null)));
  };

  return (
    <div role="group" aria-label="فیلترهای فعال" className="mb-4 flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <span
          key={chip.id}
          className="border-border bg-card inline-flex max-w-full items-center rounded-full border ps-3 pe-1 text-xs"
        >
          <span className="truncate py-1.5">{chip.label}</span>
          <button
            type="button"
            aria-label={`حذف فیلتر «${chip.label}»`}
            onClick={() => removeChip(chip)}
            className="text-muted-foreground hover:text-foreground hover:bg-accent -me-1 grid size-9 shrink-0 place-items-center rounded-full"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={removeAll}
        className="text-primary hover:bg-accent min-h-9 rounded-full px-3 text-xs font-medium"
      >
        حذف همه
      </button>
    </div>
  );
}
