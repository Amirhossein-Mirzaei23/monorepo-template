import Link from 'next/link';
import { Store } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Public marketplace home (PLAT-002) — server-rendered, no auth: discovery
 * surfaces must be reachable anonymously (SEO, shared links). Placeholder
 * only; the real marketplace listing UI is MKT-004 and replaces this shell.
 */
export default function PublicHomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-card border-b">
        <div className="mx-auto flex w-full max-w-(--app-max-width) items-center gap-4 px-6 py-3">
          <span className="me-auto font-bold">راکدشو</span>
          <Button asChild variant="outline" size="sm">
            <Link href="/login">ورود</Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-(--app-max-width) flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
        <div
          className="bg-card text-primary flex size-16 items-center justify-center rounded-2xl border"
          aria-hidden="true"
        >
          <Store className="size-8" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">بازار آنلاین کالای راکد</h1>
          <p className="text-muted-foreground max-w-md text-balance">
            خرید و فروش عمده کالای راکد و موجودی مازاد میان کسب‌وکارها؛ فهرست لات‌ها به‌زودی همین‌جا
            نمایش داده می‌شود.
          </p>
        </div>
        <Button asChild size="lg">
          <Link href="/login">ورود به راکدشو</Link>
        </Button>
      </main>
    </div>
  );
}
