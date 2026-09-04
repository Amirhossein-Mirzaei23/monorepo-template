'use client';

import { ErrorPanel } from '@/components/error-panel';

/** Route-group error boundary for (public) — doc/CONVENTIONS.md → Error Handling. */
export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorPanel title="در این صفحه خطایی رخ داد" message={error.message} onRetry={reset} />;
}
