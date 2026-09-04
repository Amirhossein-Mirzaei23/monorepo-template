'use client';

import { ErrorPanel } from '@/components/error-panel';

/** Route-group error boundary for (auth) — doc/CONVENTIONS.md → Error Handling. */
export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorPanel title="The auth area hit a snag" message={error.message} onRetry={reset} />;
}
