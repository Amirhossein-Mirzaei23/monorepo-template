'use client';

import Link from 'next/link';
import { ArrowRight, ExternalLink, ImageOff } from 'lucide-react';
import type { ConversationLotSummaryDto } from '@monorepo/shared-types';
import { LotStatusChip } from '@/features/lots';
import { formatToman } from '@/lib/format';

/**
 * CHT-006 — the pinned lot-context header (ui-patterns.md → WhatsApp-style
 * chat): cover thumb + title + price + status chip + «مشاهده لات» link, ALWAYS
 * visible above the thread so users never forget what they are negotiating.
 * The status chip updates live — the context query nests under the inbox key,
 * so a `conversation:updated` invalidation refreshes it (a lot selling
 * mid-negotiation flips the chip without a reload).
 */
export interface LotContextHeaderProps {
  /** Undefined while the context loads / when the scan missed the thread. */
  lot?: ConversationLotSummaryDto;
  loading?: boolean;
}

export function LotContextHeader({ lot, loading = false }: LotContextHeaderProps) {
  return (
    <header className="border-border bg-card/95 flex items-center gap-3 border-b p-3 backdrop-blur">
      <Link
        href="/chat"
        aria-label="بازگشت به گفتگوها"
        className="text-foreground hover:bg-muted focus-visible:ring-ring/50 flex size-9 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2"
      >
        {/* RTL mirror: back points the reading direction's "forward" edge. */}
        <ArrowRight className="size-5" aria-hidden="true" />
      </Link>

      {loading ? (
        <div
          className="flex flex-1 items-center gap-3"
          role="status"
          aria-label="در حال بارگذاری اطلاعات لات"
        >
          <div className="bg-muted size-12 shrink-0 animate-pulse rounded-xl" />
          <div className="flex-1 space-y-2">
            <div className="bg-muted h-4 w-2/3 animate-pulse rounded" />
            <div className="bg-muted h-3 w-1/3 animate-pulse rounded" />
          </div>
        </div>
      ) : lot ? (
        <>
          <div className="bg-muted relative size-12 shrink-0 overflow-hidden rounded-xl border">
            {lot.coverThumbUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- dynamic media URLs (media origin), next/image optimization not applicable
              <img src={lot.coverThumbUrl} alt="" className="size-full object-cover" />
            ) : (
              <div
                role="img"
                aria-label="تصویری برای این لات موجود نیست"
                className="flex size-full items-center justify-center"
              >
                <ImageOff className="text-zinc-400 size-5" aria-hidden="true" />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="line-clamp-1 text-sm font-semibold">{lot.title}</h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <p className="text-xs font-bold">{formatToman(lot.unitPrice)}</p>
              <LotStatusChip status={lot.status} />
            </div>
          </div>

          <Link
            href={`/l/${lot.code}`}
            className="text-primary hover:bg-primary/5 focus-visible:ring-ring/50 flex shrink-0 items-center gap-1 rounded-full px-2 py-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2"
          >
            مشاهده لات
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </Link>
        </>
      ) : (
        <p className="text-muted-foreground min-w-0 flex-1 text-sm">اطلاعات لات در دسترس نیست</p>
      )}
    </header>
  );
}
