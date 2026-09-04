import { AuthHeader } from '@/components/auth-header';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <AuthHeader />
      <main className="mx-auto w-full max-w-(--app-max-width) flex-1 p-6">{children}</main>
    </div>
  );
}
