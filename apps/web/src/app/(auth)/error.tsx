'use client';

import { Button } from '@/components/ui/button';

/** Route-group error boundary for (auth) — doc/CONVENTIONS.md → Error Handling. */
export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div role="alert" className="error-boundary">
      <h2>The auth area hit a snag</h2>
      <p>{error.message}</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
