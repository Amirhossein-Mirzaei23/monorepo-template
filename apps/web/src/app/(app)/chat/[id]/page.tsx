import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'گفتگو' };

/**
 * CHT-005 PLACEHOLDER — the inbox links every row to /chat/{id}; the real
 * thread UI (message bubbles, composer, lot-context header) lands with
 * CHT-006, which REPLACES this file.
 */
export default function ChatThreadRoute() {
  return (
    <section className="grid place-items-center gap-3 py-16 text-center">
      <p className="text-lg font-semibold">این گفتگو به‌زودی فعال می‌شود</p>
      <p className="text-muted-foreground max-w-sm text-sm">
        نمایش و ارسال پیام در نسخه بعدی اضافه می‌شود.
      </p>
      <Link href="/chat" className="text-primary text-sm font-medium hover:underline">
        بازگشت به گفتگوها
      </Link>
    </section>
  );
}
