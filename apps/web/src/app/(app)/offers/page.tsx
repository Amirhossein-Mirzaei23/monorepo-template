import { Suspense } from 'react';
import type { Metadata } from 'next';
import { OffersPage } from '@/features/offers';

export const metadata: Metadata = { title: 'پیشنهادها' };

/**
 * OFR-004 — offers route. OffersPage reads the role tab from the URL via
 * useSearchParams, so it needs the Suspense boundary here (Next.js prerender
 * requirement for search-param client hooks — the my-lots route precedent).
 */
export default function OffersRoute() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">در حال بارگذاری…</p>}>
      <OffersPage />
    </Suspense>
  );
}
