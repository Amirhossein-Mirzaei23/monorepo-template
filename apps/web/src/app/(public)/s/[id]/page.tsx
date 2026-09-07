import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PublicSellerProfileView, fetchSellerServer } from '@/features/profile';

/**
 * PROF-002 — the public seller profile `/s/{id}` (SEO/shareable, anonymous).
 * The route param is the PROFILE id — the same id space as the public sellers
 * listing (GET /profiles/sellers, MKT-004).
 *
 * SSR/client split (doc/CONVENTIONS.md decision table): this RSC fetches the
 * payload ONCE, directly from the API origin (fetchSellerServer — an RSC
 * cannot resolve the relative BFF path), validated against the generated zod
 * contract, and hands it to the server-rendered PublicSellerProfileView. No
 * client hook re-fetches this data on the page.
 *
 * 404 semantics: the API answers one uniform 404 (no oracle) for an unknown
 * profile id, a non-seller account, or a user whose status is not ACTIVE —
 * all render the fa (public) not-found page. Other fetch failures (API down)
 * propagate to the route group's error boundary (error.tsx) — never disguised
 * as a 404.
 *
 * OG metadata (basic, per card — PLAT-005 enriches): business name + fa city.
 */
interface SellerPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: SellerPageProps): Promise<Metadata> {
  const { id } = await params;
  const seller = await fetchSellerServer(id).catch(() => null);
  if (!seller) {
    return { title: 'فروشنده یافت نشد' };
  }
  const name = seller.businessName ?? seller.displayName;
  const description = [seller.city, seller.province].filter(Boolean).join('، ');

  return {
    title: name,
    description: description || name,
    openGraph: {
      title: name,
      description: description || name,
    },
  };
}

export default async function SellerProfilePage({ params }: SellerPageProps) {
  const { id } = await params;
  const seller = await fetchSellerServer(id);
  if (!seller) {
    notFound();
  }

  return (
    <main className="flex min-h-screen flex-col">
      <PublicSellerProfileView seller={seller} />
    </main>
  );
}
