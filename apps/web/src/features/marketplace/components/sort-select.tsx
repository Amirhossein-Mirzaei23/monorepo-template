'use client';

import { useId } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowUpDown } from 'lucide-react';
import {
  LOTS_BROWSE_SORTS,
  parseLotsBrowseParams,
  type LotsBrowseSort,
} from '../schemas/browse-query';
import { browseHref } from '../schemas/filters-schema';

/** Sort tokens → fa labels (MKT-008 card copy; tokens mirror the API allowlist). */
export const SORT_LABELS_FA: Record<LotsBrowseSort, string> = {
  createdAt: 'جدیدترین',
  updatedAt: 'آخرین تغییر',
  priceAsc: 'ارزان‌ترین',
  priceDesc: 'گران‌ترین',
  quantityDesc: 'بیشترین موجودی',
  quantityAsc: 'کمترین موجودی',
  expiresAt: 'نزدیک انقضا',
};

/**
 * MKT-008 — the sort dropdown of the browse toolbar. Unlike the filter sheet
 * (draft + «اعمال»), a single select has no draft to hold: the change COMMITS
 * immediately to the URL `sort` param (same name as the API) while every other
 * param — q, filters — survives untouched. Absent param = the API's default
 * (createdAt), shown as «جدیدترین».
 */
export function SortSelect() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const id = useId();
  const current = parseLotsBrowseParams(searchParams).sort ?? 'createdAt';

  const onChange = (sort: LotsBrowseSort) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('sort', sort);
    router.push(browseHref(pathname, params));
  };

  return (
    <div className="relative shrink-0">
      <ArrowUpDown
        className="text-muted-foreground pointer-events-none absolute inset-y-0 start-3 my-auto size-4"
        aria-hidden="true"
      />
      <label htmlFor={id} className="sr-only">
        مرتب‌سازی
      </label>
      <select
        id={id}
        value={current}
        onChange={(event) => onChange(event.target.value as LotsBrowseSort)}
        className="border-input bg-background text-foreground h-11 w-full min-w-36 appearance-none rounded-xl border ps-9 pe-8 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] sm:w-44"
      >
        {LOTS_BROWSE_SORTS.map((sort) => (
          <option key={sort} value={sort}>
            {SORT_LABELS_FA[sort]}
          </option>
        ))}
      </select>
    </div>
  );
}
