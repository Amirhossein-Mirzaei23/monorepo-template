import { BadgeCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Verified-seller badge (MKT-005) — emerald trust mark per ui-patterns.md.
 * LotCard renders it only when `verifiedSeller` is true; the API sends a
 * hard-coded `false` until TRS-002 lands the Verification reads, so the badge
 * stays hidden in practice while the render slot is already in place.
 * The `title` is the lightweight tooltip the palette prescribes.
 */
export function VerifiedBadge({ className }: { className?: string }) {
  return (
    <span
      title="این فروشنده فرایند تأیید هویت را کامل کرده است"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-emerald-700',
        className,
      )}
    >
      <BadgeCheck className="size-3.5" aria-hidden="true" />
      تأییدشده
    </span>
  );
}
