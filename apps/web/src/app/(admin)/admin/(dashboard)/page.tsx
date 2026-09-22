import { AdminOverview } from '@/features/admin';

/**
 * Route composition only (doc/ARCHITECTURE.md) — the dashboard's business UI
 * lives in the admin feature (Task 04: the bounded workload overview, fetched
 * client-side through the BFF behind the guarded shell).
 */
export default function AdminOverviewPage() {
  return <AdminOverview />;
}
