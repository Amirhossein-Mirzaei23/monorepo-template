import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { Providers } from '@/providers/providers';
import '@/styles/globals.css';

/**
 * Self-hosted Vazirmatn variable font (woff2, weights 100-900) — no external
 * CDN at runtime (PLAT-001); the variable definition is exposed as
 * `--font-vazirmatn` and wired into `--font-sans` in globals.css.
 */
const vazirmatn = localFont({
  src: '../../public/fonts/vazirmatn-variable.woff2',
  variable: '--font-vazirmatn',
  weight: '100 900',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'راکدشو', template: '%s | راکدشو' },
  description: 'بازار آنلاین خرید و فروش کالای راکد و موجودی مازاد برای کسب‌وکارها',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body className={vazirmatn.variable}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
