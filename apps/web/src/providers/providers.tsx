'use client';

import { AuthProvider } from '@/providers/auth-provider';
import { QueryProvider } from '@/providers/query-provider';
import { ThemeProvider } from '@/providers/theme-provider';
import { ToastProvider } from '@/components/ui/toast';

/** Provider composition used by the root layout. */
export function Providers({
  children,
  restoreSession,
}: {
  children: React.ReactNode;
  restoreSession: boolean;
}) {
  return (
    <QueryProvider>
      <ThemeProvider>
        <AuthProvider restoreSession={restoreSession}>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryProvider>
  );
}
