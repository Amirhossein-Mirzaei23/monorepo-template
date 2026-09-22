import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AdminUsers } from '@/features/admin';

export const metadata: Metadata = { title: 'کاربران' };

/**
 * Admin panel Task 05 — the /admin/users route. AdminUsers reads the whole
 * filter state from the URL via useSearchParams (linkable: the overview's
 * status deep-links land here), so it needs the Suspense boundary (Next.js
 * prerender requirement for search-param client hooks — the deals route
 * precedent).
 */
export default function AdminUsersRoute() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">در حال بارگذاری…</p>}>
      <AdminUsers />
    </Suspense>
  );
}
