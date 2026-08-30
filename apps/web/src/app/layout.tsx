import type { Metadata } from 'next';
import { Providers } from '@/providers/providers';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: { default: 'Monorepo Template', template: '%s | Monorepo Template' },
  description: 'Feature-based Next.js app from the monorepo template',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
