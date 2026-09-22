import { AdminGuard, AdminShell } from '@/features/admin';

/**
 * Guarded admin workspace. `admin/login` sits outside this route group, so an
 * anonymous visitor redirected there still renders the form (no blank guard).
 */
export default function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminGuard>
      <AdminShell>{children}</AdminShell>
    </AdminGuard>
  );
}
