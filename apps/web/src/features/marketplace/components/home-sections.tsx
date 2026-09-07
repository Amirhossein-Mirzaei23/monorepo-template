import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, PackageSearch, Store, Tags } from 'lucide-react';
import type { LotCardResponseDto, Paginated, PublicSellerListDto } from '@monorepo/shared-types';
import { Button } from '@/components/ui/button';
import { findIranCity } from '@/lib/iran-geo';
import { LotCard } from './lot-card';
import { VerifiedBadge } from './verified-badge';

/**
 * MKT-004 — the home page's section building blocks (server components: the
 * RSC route fetches every section's data in ONE parallel pass and renders
 * these directly, so there is no client waterfall — CONVENTIONS decision
 * table: first paint of a public page is fetched server-side).
 *
 * Per-section independence: a section's fetch failing never kills the page —
 * the route renders SectionErrorCard in that section's slot. RSCs cannot
 * retry client-side (no hydration boundary of their own), so the card's
 * "error boundary with retry" degrades to a «تلاش دوباره» LINK that reloads
 * the page and re-runs the server fetches — documented, acceptable per the
 * card. Empty DATA (a 200 with no rows) is not an error: sections render a
 * tasteful empty state, and the sellers strip hides entirely.
 */

/** Fixed top slices the home page asks for (card: 8 lots / 10 sellers). */
export const HOME_LOT_LIMIT = 8;
export const HOME_SELLER_LIMIT = 10;
export const HOME_CATEGORY_LIMIT = 8;

/** Grid rhythm shared with the browse list (ui-patterns.md: 2-col at 360px). */
const LOT_GRID_CLASSES = 'grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4';

export interface HomeSectionProps {
  title: string;
  /** «مشاهده همه» target — omitted for sections with no listing page yet. */
  viewAllHref?: string;
  children: ReactNode;
}

/** Section shell: heading + the card's «مشاهده همه» link to the listing page. */
export function HomeSection({ title, viewAllHref, children }: HomeSectionProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {viewAllHref ? (
          <Link
            href={viewAllHref}
            className="text-primary focus-visible:ring-ring/50 inline-flex min-h-11 items-center gap-1 rounded-lg text-sm font-medium focus-visible:outline-none focus-visible:ring-2"
          >
            مشاهده همه
            <ArrowLeft className="size-4" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

const EMPTY_ICONS = {
  package: PackageSearch,
  tags: Tags,
  store: Store,
} as const;

export interface EmptySectionProps {
  icon?: keyof typeof EMPTY_ICONS;
  title: string;
  hint?: string;
}

/** Tasteful empty state for a seeded-but-empty section (one icon + copy). */
export function EmptySection({ icon = 'package', title, hint }: EmptySectionProps) {
  const Icon = EMPTY_ICONS[icon];
  return (
    <div className="border-border bg-card grid place-items-center gap-2 rounded-xl border p-6 text-center">
      <div
        className="bg-muted text-zinc-400 flex size-12 items-center justify-center rounded-2xl"
        aria-hidden="true"
      >
        <Icon className="size-6" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}

/**
 * Inline failure card for one section. `retryHref` defaults to `/` — the link
 * reloads the page, re-running every server fetch (see module doc: an RSC
 * section has no client-side retry; a reload link is the documented stand-in
 * for the card's retry button).
 */
export function SectionErrorCard({ retryHref = '/' }: { retryHref?: string }) {
  return (
    <div
      role="alert"
      className="border-border bg-card grid place-items-center gap-2 rounded-xl border p-6 text-center"
    >
      <p className="text-sm font-medium">این بخش موقتاً در دسترس نیست</p>
      <p className="text-muted-foreground text-xs">ارتباط برقرار نشد؛ دوباره تلاش کنید.</p>
      <Button asChild variant="outline" size="sm">
        <Link href={retryHref}>تلاش دوباره</Link>
      </Button>
    </div>
  );
}

export interface HomeLotGridProps {
  /** The SSR section page (GET /lots slice) — cards ship in the HTML (LCP). */
  page: Paginated<LotCardResponseDto>;
  emptyTitle: string;
  emptyHint?: string;
}

/** A home lot section's grid: 8 LotCards, or the section's empty state. */
export function HomeLotGrid({ page, emptyTitle, emptyHint }: HomeLotGridProps) {
  if (page.items.length === 0) {
    return <EmptySection icon="package" title={emptyTitle} hint={emptyHint} />;
  }
  return (
    <div className={LOT_GRID_CLASSES} data-testid="home-lot-grid">
      {page.items.map((lot) => (
        <LotCard key={lot.id} lot={lot} variant="grid" />
      ))}
    </div>
  );
}

/**
 * «تأییدشده‌ها» strip (MKT-004 + the GET /profiles/sellers payload). Renders
 * ONLY when the verified=true call returned at least one seller: the API
 * carries a TRS-001 placeholder (`verified: false` for everyone until
 * verification exists), so today the strip is naturally hidden instead of
 * presenting unverified sellers as trusted. Non-interactive cards for now —
 * linking to /s/{id} arrives with PROF-002.
 */
export function SellersStrip({ sellers }: { sellers: PublicSellerListDto }) {
  if (sellers.items.length === 0) {
    return null;
  }
  return (
    <ul aria-label="فروشندگان تأییدشده" className="flex gap-3 overflow-x-auto pb-1">
      {sellers.items.map((seller) => {
        const cityLabel = seller.city
          ? (findIranCity(seller.province ?? '', seller.city)?.nameFa ?? seller.city)
          : undefined;
        return (
          <li
            key={seller.id}
            className="border-border bg-card flex w-40 shrink-0 flex-col gap-1.5 rounded-xl border p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className="bg-muted text-zinc-700 flex size-8 items-center justify-center rounded-lg"
                aria-hidden="true"
              >
                <Store className="size-4" />
              </span>
              {seller.verified ? <VerifiedBadge /> : null}
            </div>
            <p className="truncate text-sm font-semibold">
              {seller.businessName ?? seller.displayName}
            </p>
            {cityLabel ? <p className="text-muted-foreground text-xs">{cityLabel}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}
