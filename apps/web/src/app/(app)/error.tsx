'use client';

import { ErrorPanel } from '@/components/error-panel';

/** Route-group error boundary for (app) — doc/CONVENTIONS.md → Error Handling. */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorPanel title="در این صفحه خطایی رخ داد" message={error.message} onRetry={reset} />;
}
