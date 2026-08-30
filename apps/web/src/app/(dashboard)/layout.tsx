import { AuthHeader } from '@/components/auth-header';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dashboard-shell">
      <AuthHeader />
      <main className="dashboard-main">{children}</main>
    </div>
  );
}
