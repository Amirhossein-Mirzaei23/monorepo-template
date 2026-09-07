import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  LotList,
  fetchCategoriesServer,
  fetchLotsServer,
  findCategoryBySlug,
  parseLotsBrowseParams,
  LOT_LIST_PAGE_SIZE,
} from '@/features/marketplace';

/**
 * MKT-006 — the category SEO landing `/c/{slug}`: the SAME browse list,
 * pre-scoped to the category. The slug is resolved to the category id
 * server-side over the public tree (`findCategoryBySlug`, unknown → 404);
 * the id is passed to the client list as a page scope that WINS over URL
 * params, while the rest of the URL state (sort, filters, q) keeps working
 * (PLAT-005 refines the SEO surface later). Same SSR page-1 handoff as
 * /lots — see that page's doc for the SSR/client split.
 */
interface CategoryPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = await fetchCategoriesServer()
    .then((tree) => findCategoryBySlug(tree, slug))
    .catch(() => undefined);
  return {
    title: category ? `لات‌های دسته ${category.nameFa}` : 'دسته‌بندی لات‌ها',
  };
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const [{ slug }, rawParams] = await Promise.all([params, searchParams]);
  // Resolve BEFORE fetching lots — an unknown slug is a 404, not an empty grid.
  const tree = await fetchCategoriesServer();
  const category = findCategoryBySlug(tree, slug);
  if (!category) {
    notFound();
  }

  const scope = { categoryId: category.id };
  const initialPage = await fetchLotsServer({
    ...parseLotsBrowseParams(rawParams),
    ...scope,
    page: 1,
    limit: LOT_LIST_PAGE_SIZE,
  }).catch(() => undefined);

  return (
    <main className="mx-auto w-full max-w-(--app-max-width) px-4 pb-10 pt-5 sm:px-6">
      <header className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight">{category.nameFa}</h1>
      </header>
      <Suspense fallback={<p className="text-muted-foreground text-sm">در حال بارگذاری…</p>}>
        <LotList scope={scope} initialPage={initialPage} />
      </Suspense>
    </main>
  );
}
