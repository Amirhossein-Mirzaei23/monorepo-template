'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

const navigation = [
  ['/admin', 'نمای کلی'],
  ['/admin/users', 'کاربران'],
  ['/admin/lots', 'لات‌ها'],
  ['/admin/reports', 'گزارش‌ها'],
  ['/admin/verifications', 'تأییدها'],
  ['/admin/deals', 'معاملات'],
  ['/admin/categories', 'دسته‌بندی‌ها'],
  ['/admin/audit', 'حسابرسی'],
] as const;

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { logout } = useAuth();
  return (
    <div dir="rtl" className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col md:flex-row">
        <aside className="border-b bg-white p-4 md:w-64 md:border-b-0 md:border-e">
          <h1 className="mb-4 text-lg font-semibold">فضای مدیریت</h1>
          <nav aria-label="ناوبری مدیریت" className="grid grid-cols-2 gap-2 md:grid-cols-1">
            {navigation.map(([href, label]) => (
              <Link
                key={href}
                href={href}
                aria-current={pathname === href ? 'page' : undefined}
                className={cn(
                  'rounded-md px-3 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  pathname === href ? 'bg-primary text-primary-foreground' : 'hover:bg-zinc-100',
                )}
              >
                {label}
              </Link>
            ))}
          </nav>
          <Button
            type="button"
            variant="ghost"
            className="mt-4 min-h-11 w-full justify-start"
            onClick={() => void logout()}
          >
            <LogOut aria-hidden="true" />
            خروج
          </Button>
        </aside>
        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

export { AdminShell as Shell };
