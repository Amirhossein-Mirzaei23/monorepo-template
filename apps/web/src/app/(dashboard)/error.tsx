'use client';

import { ErrorPanel } from '@/components/error-panel';

/** Route-group error boundary for (dashboard) — doc/CONVENTIONS.md → Error Handling. */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorPanel title="Something went wrong on this page" message={error.message} onRetry={reset} />
  );
}
