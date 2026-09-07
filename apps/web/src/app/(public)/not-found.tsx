import Link from 'next/link';
import { Button } from '@/components/ui/button';

/**
 * MKT-009 — the fa not-found page for the (public) route group. notFound()
 * from the lot detail route (/l/{code}) lands here when a code is unknown or
 * its lot is not public anymore (deleted / expired / paused — the public view
 * has no oracle for which).
 */
export default function PublicNotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <p aria-hidden="true" className="text-6xl font-bold tracking-tight">
        ۴۰۴
      </p>
      <h1 className="text-xl font-semibold">این صفحه پیدا نشد</h1>
      <p className="text-muted-foreground max-w-sm text-sm leading-6">
        ممکن است این لات حذف شده، منقضی شده یا در دسترس نباشد.
      </p>
      <Button asChild className="mt-2">
        <Link href="/lots">مشاهده لات‌ها</Link>
      </Button>
    </main>
  );
}
