import { Button } from '@/components/ui/button';

export interface ErrorPanelProps {
  title: string;
  message: string;
  onRetry: () => void;
}

/**
 * Shared panel for route-group error boundaries — the boundaries themselves
 * stay per route group (doc/CONVENTIONS.md → Error Handling).
 */
export function ErrorPanel({ title, message, onRetry }: ErrorPanelProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-xl border border-destructive p-6"
    >
      <h2>{title}</h2>
      <p>{message}</p>
      <Button onClick={onRetry}>Try again</Button>
    </div>
  );
}
