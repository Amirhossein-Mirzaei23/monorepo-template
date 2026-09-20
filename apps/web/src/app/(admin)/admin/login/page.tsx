import type { Metadata } from 'next';
import { AdminLoginForm } from '@/features/admin';
import { safeAdminNext } from '@/features/admin';

export const metadata: Metadata = { title: 'ورود مدیریت' };

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <main
      dir="rtl"
      className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6"
    >
      <div>
        <h1 className="text-2xl font-semibold">ورود به مدیریت</h1>
        <p className="text-muted-foreground mt-2 text-sm">برای ادامه، اطلاعات مدیر را وارد کنید.</p>
      </div>
      <AdminLoginForm next={safeAdminNext(next)} />
    </main>
  );
}
