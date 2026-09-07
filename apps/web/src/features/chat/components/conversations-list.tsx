'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { ImageOff, MessageSquare, RotateCcw } from 'lucide-react';
import type { ConversationListItemDto } from '@monorepo/shared-types';
import { LotStatusChip } from '@/features/lots';
import { VerifiedBadge } from '@/features/marketplace';
import { Button } from '@/components/ui/button';
import { formatFaDigits, formatRelativeTimeFa, formatToman } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ConversationsListState } from '../hooks/use-conversations';

/**
 * CHT-005 — the inbox list (ui-patterns.md → WhatsApp-style chat: a 1-column
 * conversation list where the LOT context stays prominent). Every row is ONE
 * link to /chat/{id}: lot thumb, lot title + relative time, price + lot status
 * chip (فروخته شده / منقضی شده arrive automatically on lifecycle changes),
 * counterpart + verified badge (hidden while TRS-001 keeps it hard-false),
 * ≤ 80-char preview (gray italic in the SYSTEM style) and the unread badge
 * (primary pill, fa digits). Scroll loads the next page through an
 * IntersectionObserver sentinel with a «بیشتر» button fallback (frontend-data.md);
 * a failed append renders an inline retry row and KEEPS the loaded rows.
 */

export interface ConversationsListProps {
  list: ConversationsListState;
}

function ConversationRowSkeleton() {
  return (
    <div aria-hidden="true" className="bg-card flex gap-3 rounded-xl border p-3">
      <div className="bg-muted size-16 shrink-0 animate-pulse rounded-xl" />
      <div className="flex-1 space-y-2 py-0.5">
        <div className="bg-muted h-4 w-3/4 animate-pulse rounded" />
        <div className="bg-muted h-3 w-1/2 animate-pulse rounded" />
        <div className="bg-muted h-3 w-2/3 animate-pulse rounded" />
      </div>
    </div>
  );
}

export function ConversationRow({ conversation: c }: { conversation: ConversationListItemDto }) {
  return (
    <Link
      href={`/chat/${c.id}`}
      className="border-border bg-card hover:border-zinc-300 focus-visible:ring-ring/50 flex gap-3 rounded-xl border p-3 transition-colors focus-visible:outline-none focus-visible:ring-2"
    >
      <div className="bg-muted relative size-16 shrink-0 overflow-hidden rounded-xl border">
        {c.lot.coverThumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- dynamic media URLs (media origin), next/image optimization not applicable
          <img src={c.lot.coverThumbUrl} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <div
            role="img"
            aria-label="تصویری برای این لات موجود نیست"
            className="flex size-full items-center justify-center"
          >
            <ImageOff className="text-zinc-400 size-6" aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="line-clamp-1 text-sm font-semibold">{c.lot.title}</h3>
          <span className="text-muted-foreground shrink-0 text-xs">
            {formatRelativeTimeFa(c.lastMessageAt)}
          </span>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-2">
          <p className="text-sm font-bold">{formatToman(c.lot.unitPrice)}</p>
          <LotStatusChip status={c.lot.status} />
        </div>

        <div className="text-muted-foreground mt-1 flex items-center gap-1.5 text-xs">
          <span className="truncate font-medium">{c.counterpart.name}</span>
          {c.counterpart.verified ? <VerifiedBadge /> : null}
        </div>

        <div className="mt-1 flex items-center justify-between gap-2">
          <p
            className={cn(
              'line-clamp-1 text-xs',
              c.isLastMessageSystem ? 'text-muted-foreground italic' : 'text-foreground/80',
            )}
          >
            {c.lastMessagePreview ?? '—'}
          </p>
          {c.myUnreadCount > 0 ? (
            <span
              aria-label={`${formatFaDigits(c.myUnreadCount)} پیام خوانده‌نشده`}
              className="bg-primary text-primary-foreground shrink-0 rounded-full px-2 py-0.5 text-xs font-bold"
            >
              {formatFaDigits(c.myUnreadCount)}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

export function ConversationsList({ list }: ConversationsListProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Infinite scroll sentinel (frontend-data.md); the «بیشتر» button below is
  // the keyboard/manual fallback when the observer is unavailable.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !list.hasNextPage) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !list.isFetchingNextPage) {
          list.fetchNextPage();
        }
      },
      { rootMargin: '240px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [list]);

  if (list.isLoading) {
    return (
      <div role="status" aria-label="در حال بارگذاری گفتگوها" className="grid gap-3">
        <ConversationRowSkeleton />
        <ConversationRowSkeleton />
        <ConversationRowSkeleton />
        <ConversationRowSkeleton />
      </div>
    );
  }

  if (list.isError && list.items.length === 0) {
    return (
      <div
        role="alert"
        className="border-border bg-card grid place-items-center gap-3 rounded-xl border p-8 text-center"
      >
        <p className="text-sm font-medium">دریافت گفتگوها ناموفق بود</p>
        <p className="text-muted-foreground text-xs">اتصال خود را بررسی کنید و دوباره تلاش کنید.</p>
        <Button variant="outline" className="mx-auto" onClick={list.refetch}>
          <RotateCcw className="size-4" aria-hidden="true" />
          تلاش مجدد
        </Button>
      </div>
    );
  }

  if (list.items.length === 0) {
    return (
      <div className="border-border bg-card grid place-items-center gap-3 rounded-xl border p-8 text-center">
        <div
          className="bg-muted text-zinc-400 flex size-14 items-center justify-center rounded-2xl"
          aria-hidden="true"
        >
          <MessageSquare className="size-7" />
        </div>
        <p className="text-sm font-medium">هنوز گفتگویی ندارید</p>
        <p className="text-muted-foreground text-xs">
          از صفحه هر لات «گفتگو با فروشنده» را بزنید — گفتگوهای شما اینجا نمایش داده می‌شود.
        </p>
        <Button asChild className="mx-auto">
          <Link href="/lots">مشاهده لات‌ها</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {list.items.map((conversation) => (
        <ConversationRow key={conversation.id} conversation={conversation} />
      ))}

      {list.isError ? (
        // Per-page append failure — the loaded list stays; retry resumes the
        // broken page (or the refetch when the failure hit a refresh instead).
        <div
          role="alert"
          className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 py-4 text-center"
        >
          <p className="text-muted-foreground text-sm">بارگذاری ادامه فهرست ناموفق بود.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={list.hasNextPage ? list.fetchNextPage : list.refetch}
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            تلاش مجدد
          </Button>
        </div>
      ) : (
        <div ref={sentinelRef} aria-hidden="true" />
      )}

      {list.hasNextPage ? (
        <Button
          variant="outline"
          className="mx-auto"
          disabled={list.isFetchingNextPage}
          onClick={list.fetchNextPage}
        >
          {list.isFetchingNextPage ? 'در حال بارگذاری…' : 'بیشتر'}
        </Button>
      ) : (
        <p className="text-muted-foreground py-2 text-center text-xs">همه گفتگوها نمایش داده شد</p>
      )}
    </div>
  );
}
