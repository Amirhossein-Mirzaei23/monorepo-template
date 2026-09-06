'use client';

import Link from 'next/link';
import { Check, Copy, Package, Pause, Pencil, Play, Trash2 } from 'lucide-react';
import type { LotOwnerResponseDto } from '@monorepo/shared-types';
import { Card } from '@/components/ui/card';
import { formatFaDigits, formatJalali, formatToman } from '@/lib/format';
import type { LotLifecycleAction } from '../api/lots-api';
import { LOT_UNIT_LABELS_FA } from '../schemas/lot-schema';
import { LotStatusChip } from './lot-status-chip';

export interface MyLotRowProps {
  lot: LotOwnerResponseDto;
  /** Confirmed lifecycle action (pause/resume/mark-sold/duplicate). */
  onAction: (lot: LotOwnerResponseDto, action: LotLifecycleAction) => void;
  /** Confirmed delete (soft delete → REMOVED). */
  onDelete: (lot: LotOwnerResponseDto) => void;
}

/**
 * One inventory row (LOT-005): cover thumb (or placeholder), title link → the
 * edit wizard (every status opens it — the wizard enforces read-only modes),
 * price hierarchy, quantity + expiry, fa status chip, and the STATUS-SCOPED
 * quick actions from the LOT-003 transition table:
 *
 * | status         | pause | resume | mark-sold | duplicate | edit | delete |
 * |----------------|-------|--------|-----------|-----------|------|--------|
 * | DRAFT          |       |        |           | ✓         | ✓    | ✓      |
 * | PENDING_REVIEW |       |        |           | ✓         | ✓    | ✓      |
 * | ACTIVE         | ✓     |        | ✓         | ✓         | ✓    | ✓      |
 * | PAUSED         |       | ✓      | ✓         | ✓         | ✓    | ✓      |
 * | REJECTED       |       |        |           | ✓         | ✓    | ✓      |
 * | EXPIRED        |       |        |           | ✓         | ✓    | ✓      |
 * | SOLD           |       |        |           | ✓         | ✓    |        |
 */
export function MyLotRow({ lot, onAction, onDelete }: MyLotRowProps) {
  const cover = lot.media.find((item) => item.isCover) ?? lot.media[0];
  const thumbUrl = cover?.thumbUrl ?? cover?.url;
  const canPause = lot.status === 'ACTIVE';
  const canResume = lot.status === 'PAUSED';
  const canMarkSold = lot.status === 'ACTIVE' || lot.status === 'PAUSED';
  const canDelete = lot.status !== 'SOLD' && lot.status !== 'REMOVED';

  const actionButton =
    'text-muted-foreground hover:bg-accent hover:text-foreground inline-flex size-11 items-center justify-center rounded-md border border-transparent';

  return (
    <Card className="p-3">
      <div className="flex gap-3">
        <Link
          href={`/dashboard/lots/${lot.id}/edit`}
          className="bg-muted relative size-20 shrink-0 overflow-hidden rounded-xl border"
          aria-label={`ویرایش ${lot.title}`}
        >
          {thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- dynamic media origin URLs; next/image optimization not applicable (same trade-off as LotSummaryCard)
            <img src={thumbUrl} alt="" className="size-full object-cover" />
          ) : (
            <span className="text-muted-foreground absolute inset-0 flex items-center justify-center">
              <Package className="size-6" aria-hidden="true" />
            </span>
          )}
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <Link
              href={`/dashboard/lots/${lot.id}/edit`}
              className="line-clamp-2 text-sm font-semibold hover:underline"
            >
              {lot.title}
            </Link>
            <LotStatusChip status={lot.status} />
          </div>
          <p className="mt-1 text-sm font-bold">{formatToman(lot.totalPrice)}</p>
          <p className="text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
            <span>
              {formatFaDigits(lot.quantity)} {LOT_UNIT_LABELS_FA[lot.unit]}
            </span>
            <span>~{formatToman(lot.unitPrice)} هر واحد</span>
            <span>مهلت: تا {formatJalali(lot.expiresAt)}</span>
          </p>
        </div>
      </div>

      <div
        role="group"
        aria-label={`اقدامات ${lot.title}`}
        className="text-muted-foreground mt-2 flex items-center gap-1 border-t pt-2"
      >
        <Link
          href={`/dashboard/lots/${lot.id}/edit`}
          aria-label="ویرایش"
          title="ویرایش"
          className={actionButton}
        >
          <Pencil className="size-4" aria-hidden="true" />
        </Link>
        {canPause ? (
          <button
            type="button"
            aria-label="توقف موقت"
            title="توقف موقت"
            className={actionButton}
            onClick={() => onAction(lot, 'pause')}
          >
            <Pause className="size-4" aria-hidden="true" />
          </button>
        ) : null}
        {canResume ? (
          <button
            type="button"
            aria-label="فعال‌سازی مجدد"
            title="فعال‌سازی مجدد"
            className={actionButton}
            onClick={() => onAction(lot, 'resume')}
          >
            <Play className="size-4" aria-hidden="true" />
          </button>
        ) : null}
        {canMarkSold ? (
          <button
            type="button"
            aria-label="ثبت فروش"
            title="ثبت فروش"
            className={actionButton}
            onClick={() => onAction(lot, 'mark-sold')}
          >
            <Check className="size-4" aria-hidden="true" />
          </button>
        ) : null}
        <button
          type="button"
          aria-label="تکثیر آگهی"
          title="تکثیر آگهی"
          className={actionButton}
          onClick={() => onAction(lot, 'duplicate')}
        >
          <Copy className="size-4" aria-hidden="true" />
        </button>
        {canDelete ? (
          <button
            type="button"
            aria-label="حذف آگهی"
            title="حذف آگهی"
            className={`${actionButton} hover:text-destructive`}
            onClick={() => onDelete(lot)}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </Card>
  );
}
