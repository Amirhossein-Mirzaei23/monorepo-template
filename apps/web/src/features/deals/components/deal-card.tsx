'use client';

import Link from 'next/link';
import type { DealResponseDto } from '@monorepo/shared-types';
import { Card } from '@/components/ui/card';
import { formatFaDigits, formatRelativeTimeFa, formatToman } from '@/lib/format';
import { cn } from '@/lib/utils';
import { DealStatusChip } from './deal-status-chip';

/**
 * DEAL-004 — one row of the /deals list (a LINK — the card's whole surface
 * navigates to the detail): the lot title + status chip, the totalPrice
 * headline (formatToman), the unit-price/quantity meta line, and the
 * creation relative time. Terminal deals dim (opacity) instead of hiding —
 * the history stays visible; DISPUTED stays prominent (an action is
 * pending). The list orders by most-recent activity server-side.
 */
export interface DealCardProps {
  deal: DealResponseDto;
}

export function DealCard({ deal }: DealCardProps) {
  // Only the FINISHED states dim; DISPUTED needs attention (see
  // TERMINAL_DEAL_STATUSES for the polling/matrix side of "terminal").
  const dimmed = deal.status === 'COMPLETED' || deal.status === 'CANCELLED';

  return (
    <Card
      className={cn('gap-0 p-3', dimmed && 'opacity-60')}
      data-status={deal.status}
      data-testid="deal-card"
    >
      <Link href={`/deals/${deal.code}`} className="block">
        <div className="flex items-start justify-between gap-2">
          <span className="line-clamp-2 text-sm leading-6 font-medium hover:underline">
            {deal.lot.title}
          </span>
          <DealStatusChip status={deal.status} />
        </div>

        <p className="mt-1.5 text-base font-semibold">{formatToman(deal.totalPrice)}</p>
        <p className="text-muted-foreground mt-0.5 text-xs">
          قیمت واحد {formatToman(deal.unitPrice)} · تعداد {formatFaDigits(deal.quantity)}
        </p>
        <p className="text-muted-foreground mt-1 text-[11px]">
          {formatRelativeTimeFa(deal.createdAt)} · کد معامله {formatFaDigits(deal.code)}
        </p>
      </Link>
    </Card>
  );
}
