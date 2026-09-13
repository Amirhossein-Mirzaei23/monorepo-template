import { Suspense } from 'react';
import type { Metadata } from 'next';
import { DealsPage } from '@/features/deals';

export const metadata: Metadata = { title: 'معامله‌ها' };

/**
 * DEAL-004 — the /deals route. DealsPage reads the role tab + status chip
 * from the URL via useSearchParams, so it needs the Suspense boundary here
 * (Next.js prerender requirement for search-param client hooks — the offers
 * route precedent).
 */
export default function DealsRoute() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">در حال بارگذاری…</p>}>
      <DealsPage />
    </Suspense>
  );
}
