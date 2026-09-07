import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LotDetail, fetchLotDetailServer } from '@/features/marketplace';
import { formatToman } from '@/lib/format';
import { findIranCity } from '@/lib/iran-geo';

/**
 * MKT-009 — the public lot detail `/l/{code}` (SEO/shareable, anonymous).
 *
 * SSR/client split (doc/CONVENTIONS.md decision table): this RSC fetches the
 * detail ONCE, directly from the API origin (fetchLotDetailServer — an RSC
 * cannot resolve the relative BFF path), validated against the generated zod
 * contract, and hands the payload down to the LotDetail client island. No
 * client hook re-fetches the same data on this page.
 *
 * 404 semantics: the API answers 404 for an unknown code AND for any
 * non-public lot (DRAFT/PAUSED/EXPIRED/REMOVED... — the public view has no
 * oracle) → notFound() renders the fa (public) not-found page. OWNERS viewing
 * their own non-active lots keep using the owner surfaces (the dashboard's
 * /dashboard/lots via GET /lots/:id, LOT-005): the RSC has no access token
 * (it lives in client memory), so an owner-preview of a draft on /l/{code}
 * would require an authenticated fetch this page deliberately does not do.
 * Sellers preview drafts from the wizard/summary; this interpretation is
 * documented on the card as the pragmatic public/owner split.
 *
 * Other fetch failures (API down) propagate to the route group's error
 * boundary (error.tsx) — never disguised as a 404.
 *
 * OG metadata (basic, per card — PLAT-005 enriches): title / price / city
 * text plus the first gallery image when one exists.
 */
interface LotDetailPageProps {
  params: Promise<{ code: string }>;
}

export async function generateMetadata({ params }: LotDetailPageProps): Promise<Metadata> {
  const { code } = await params;
  const lot = await fetchLotDetailServer(code).catch(() => null);
  if (!lot) {
    return { title: 'لات یافت نشد' };
  }
  const cityFa = findIranCity(lot.province, lot.city)?.nameFa ?? lot.city;
  const description = `${formatToman(lot.totalPrice)} — ${cityFa}`;
  const cover = lot.media.find((item) => item.kind === 'IMAGE');

  return {
    title: lot.title,
    description,
    openGraph: {
      title: lot.title,
      description,
      ...(cover ? { images: [{ url: cover.url }] } : {}),
    },
  };
}

export default async function LotDetailPage({ params }: LotDetailPageProps) {
  const { code } = await params;
  const lot = await fetchLotDetailServer(code);
  if (!lot) {
    notFound();
  }

  return (
    <main className="flex min-h-screen flex-col">
      <LotDetail lot={lot} />
    </main>
  );
}
