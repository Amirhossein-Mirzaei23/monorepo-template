import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  CategoryTiles,
  HomeLotGrid,
  HomeSection,
  HOME_CATEGORY_LIMIT,
  HOME_LOT_LIMIT,
  HOME_SELLER_LIMIT,
  SearchBar,
  SectionErrorCard,
  SellersStrip,
  fetchCategoriesServer,
  fetchLotsServer,
  fetchSellersServer,
} from '@/features/marketplace';

/**
 * MKT-004 — the public marketplace home `/` (replaces the PLAT-002 shell).
 * Server-rendered discovery page, reachable anonymously (SEO + shared links).
 *
 * Data: ONE parallel RSC pass fires the four @Public origin hops (category
 * tree, fresh lots, ending-soon lots, verified-seller strip) — direct hops
 * like fetchLotsServer (an RSC cannot resolve the relative BFF path), no
 * client waterfall (CONVENTIONS → SSR decision table; hero and first cards
 * ship in the HTML for LCP, card covers are lazy). Each fetch degrades to
 * `undefined` on failure, so a dying section renders its inline
 * SectionErrorCard («تلاش دوباره» reload link) while the rest of the page
 * stays up — per-section independence, per the card.
 *
 * Sections: hero search (MKT-007 bar → /lots?q=), category tiles → /c/{slug}
 * (CAT-001 tree + categories icon map), «تازه‌ها» (GET /lots newest 8, مشاهده
 * همه → /lots), «به‌زودی تمام می‌شوند» (GET /lots?sort=expiresAt 8 →
 * /lots?sort=expiresAt), «تأییدشده‌ها» (GET /profiles/sellers?verified=true).
 * The strip renders only when the verified=true call returns at least one
 * seller — the API's verified field is a TRS-001 placeholder (hard false), so
 * the section stays hidden until real verification exists instead of faking
 * trust. «بهترین قیمت‌ها» (best deals) is DEFERRED per plan §9 — the section
 * slot stays out until a liquidity heuristic exists (add it here once it
 * does, e.g. as a sort on the lots listing).
 *
 * Seeded-but-empty sections render tasteful empty states; the strip alone
 * hides (that is its contract, not an empty state).
 */
export const metadata: Metadata = {
  title: { absolute: 'راکدشو — بازارگاه عمده کالای راکد' },
  description:
    'خرید و فروش عمده کالای راکد و موجودی مازاد میان کسب‌وکارها — تازه‌ترین لات‌ها، فرصت‌های در آستانه پایان و فروشندگان تأییدشده.',
};

export default async function PublicHomePage() {
  const [tree, fresh, endingSoon, sellers] = await Promise.all([
    fetchCategoriesServer().catch(() => undefined),
    fetchLotsServer({ sort: 'createdAt', page: 1, limit: HOME_LOT_LIMIT }).catch(() => undefined),
    fetchLotsServer({ sort: 'expiresAt', page: 1, limit: HOME_LOT_LIMIT }).catch(() => undefined),
    fetchSellersServer({ verified: true, limit: HOME_SELLER_LIMIT }).catch(() => undefined),
  ]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-card border-b">
        <div className="mx-auto flex w-full max-w-(--app-max-width) items-center gap-4 px-6 py-3">
          <span className="me-auto font-bold">راکدشو</span>
          <Button asChild variant="outline" size="sm">
            <Link href="/login">ورود</Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-(--app-max-width) flex-1 px-4 pb-12 pt-6 sm:px-6">
        <section className="flex flex-col items-center gap-3 pb-8 pt-4 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">بازارگاه عمده کالای راکد</h1>
          <p className="text-muted-foreground max-w-md text-balance">
            خرید و فروش عمده کالای راکد و موجودی مازاد میان کسب‌وکارها
          </p>
          <div className="w-full max-w-xl pt-1">
            <SearchBar />
          </div>
        </section>

        <div className="space-y-8">
          <HomeSection title="دسته‌بندی‌ها">
            {tree ? (
              <CategoryTiles categories={tree.slice(0, HOME_CATEGORY_LIMIT)} />
            ) : (
              <SectionErrorCard />
            )}
          </HomeSection>

          <HomeSection title="تازه‌ها" viewAllHref="/lots">
            {fresh ? (
              <HomeLotGrid
                page={fresh}
                emptyTitle="هنوز لاتی ثبت نشده"
                emptyHint="اولین لات‌ها به‌زودی همین‌جا نمایش داده می‌شوند."
              />
            ) : (
              <SectionErrorCard />
            )}
          </HomeSection>

          <HomeSection title="به‌زودی تمام می‌شوند" viewAllHref="/lots?sort=expiresAt">
            {endingSoon ? (
              <HomeLotGrid
                page={endingSoon}
                emptyTitle="لاتی در آستانه پایان نیست"
                emptyHint="فرصت‌های جاری را در فهرست لات‌ها ببینید."
              />
            ) : (
              <SectionErrorCard />
            )}
          </HomeSection>

          {sellers === undefined ? (
            <HomeSection title="تأییدشده‌ها">
              <SectionErrorCard />
            </HomeSection>
          ) : sellers.items.length > 0 ? (
            <HomeSection title="تأییدشده‌ها">
              <SellersStrip sellers={sellers} />
            </HomeSection>
          ) : null}
        </div>
      </main>
    </div>
  );
}
