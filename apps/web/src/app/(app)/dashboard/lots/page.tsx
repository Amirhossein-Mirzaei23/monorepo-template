import { Suspense } from 'react';
import type { Metadata } from 'next';
import { MyLotsPage } from '@/features/lots';

export const metadata: Metadata = { title: 'آگهی‌های من' };

/**
 * LOT-005 — seller inventory route. MyLotsPage reads the tab from the URL via
 * useSearchParams, so it needs the Suspense boundary here (Next.js prerender
 * requirement for search-param client hooks).
 */
export default function MyLotsRoute() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">در حال بارگذاری…</p>}>
      <MyLotsPage />
    </Suspense>
  );
}
