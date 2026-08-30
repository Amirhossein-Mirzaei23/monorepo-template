'use client';

import { Button } from '@/components/ui/button';

/** Route-group error boundary for (dashboard) — doc/CONVENTIONS.md → Error Handling. */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div role="alert" className="error-boundary">
      <h2>Something went wrong on this page</h2>
      <p>{error.message}</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
