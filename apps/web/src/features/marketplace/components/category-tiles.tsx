import Link from 'next/link';
import type { CategoryTreeNodeDto } from '@monorepo/shared-types';
import { categoryIcon } from '@/features/categories';
import { cn } from '@/lib/utils';
import { EmptySection } from './home-sections';

/**
 * MKT-004 — the home category tiles: top-level categories of the public tree
 * (CAT-001) as icon tiles linking to the /c/{slug} landings (MKT-006). Icons
 * come from the categories feature map (categoryIcon — unknown slugs fall
 * back to a neutral tag icon), so admin-managed taxonomy changes never break
 * the tile. A server component: rendered once per request on the RSC path,
 * no client JS. Tiles are top-level ONLY — children live inside the landing
 * pages and the filter cascade (MKT-008).
 */
export interface CategoryTilesProps {
  /** Top-level tree nodes, already sliced to the home tile count by the page. */
  categories: CategoryTreeNodeDto[];
  className?: string;
}

export function CategoryTiles({ categories, className }: CategoryTilesProps) {
  if (categories.length === 0) {
    return (
      <EmptySection
        icon="tags"
        title="دسته‌ای یافت نشد"
        hint="دسته‌بندی‌ها به‌زودی تکمیل می‌شوند."
      />
    );
  }

  return (
    <nav
      aria-label="دسته‌بندی‌ها"
      className={cn('grid grid-cols-4 gap-2 md:grid-cols-8', className)}
    >
      {categories.map((category) => {
        const Icon = categoryIcon(category.slug);
        return (
          <Link
            key={category.id}
            href={`/c/${category.slug}`}
            className="border-border bg-card hover:border-zinc-300 focus-visible:ring-ring/50 flex flex-col items-center gap-2 rounded-xl border px-2 py-3 text-center transition-colors focus-visible:outline-none focus-visible:ring-2"
          >
            <span
              className="bg-muted text-zinc-700 flex size-10 items-center justify-center rounded-xl"
              aria-hidden="true"
            >
              <Icon className="size-5" />
            </span>
            <span className="line-clamp-2 text-xs font-medium">{category.nameFa}</span>
          </Link>
        );
      })}
    </nav>
  );
}
