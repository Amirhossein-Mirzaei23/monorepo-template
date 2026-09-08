'use client';

import Link from 'next/link';
import type { OfferResponseDto } from '@monorepo/shared-types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatFaDigits, formatJalali, formatRelativeTimeFa, formatToman } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useOfferAction } from '../hooks/use-offer-actions';
import { OfferStatusChip } from './offer-status-chip';

/**
 * OFR-004 — one offer row/tile of the /offers lists (and the sheet's host for
 * the counter action): the lot link + status chip, the totalPrice headline
 * (formatToman — fa digits + «تومان»), the unit-price/quantity meta line,
 * relative created date (+ the PENDING decision deadline as an absolute
 * Jalali date — formatRelativeTimeFa is past-oriented and would misread a
 * live future deadline as «چند لحظه پیش»), the maker's optional note,
 * and the ROLE- AND STATUS-SCOPED action bar:
 *
 * - seller  + PENDING → accept (primary) / counter (opens the shared sheet) /
 *   reject (danger outline);
 * - buyer   + PENDING → cancel;
 * - seller  + ACCEPTED → the «ایجاد معامله» success strip — the DEAL-002 CTA
 *   is deliberately DISABLED with a «به‌زودی» hint: deal creation is not
 *   implemented yet (DEAL-002), the acceptance only creates the eligibility.
 *
 * REJECTED/CANCELLED/EXPIRED cards dim (opacity) instead of hiding — the
 * negotiation history stays visible, matching the card's visual states.
 * Actions invalidate + refetch (no optimistic surgery); failures toast with
 * the mapped fa copy of the API's error codes.
 */
export interface OfferCardProps {
  offer: OfferResponseDto;
  /** Present on list surfaces that host the counter sheet (seller, PENDING). */
  onCounter?: (offer: OfferResponseDto) => void;
}

export function OfferCard({ offer, onCounter }: OfferCardProps) {
  const act = useOfferAction();
  const isPending = offer.status === 'PENDING';
  const isSeller = offer.myRole === 'seller';
  const dimmed =
    offer.status === 'REJECTED' ||
    offer.status === 'CANCELLED' ||
    offer.status === 'EXPIRED' ||
    offer.status === 'COUNTERED';

  return (
    <Card
      className={cn('gap-0 p-3', dimmed && 'opacity-60')}
      data-status={offer.status}
      data-testid="offer-card"
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/l/${offer.lot.code}`}
          className="line-clamp-2 text-sm leading-6 font-medium hover:underline"
        >
          {offer.lot.title}
        </Link>
        <OfferStatusChip status={offer.status} />
      </div>

      <p className="mt-1.5 text-base font-semibold">{formatToman(offer.totalPrice)}</p>
      <p className="text-muted-foreground mt-0.5 text-xs">
        قیمت واحد {formatToman(offer.unitPrice)} · تعداد {formatFaDigits(offer.quantity)}
      </p>
      <p className="text-muted-foreground mt-1 text-[11px]">
        {formatRelativeTimeFa(offer.createdAt)}
        {/* The deadline is in the future, so the past-oriented formatRelativeTimeFa
            would always read «چند لحظه پیش» — render it as an absolute Jalali date. */}
        {isPending ? ` · مهلت پاسخ: ${formatJalali(offer.expiresAt)}` : ''}
      </p>

      {offer.note !== null && offer.note !== undefined ? (
        <p className="mt-2 rounded-lg bg-zinc-50 px-2.5 py-1.5 text-xs leading-5 text-zinc-600">
          یادداشت: {offer.note}
        </p>
      ) : null}

      {isSeller && offer.status === 'ACCEPTED' ? (
        <div className="mt-2.5 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5">
          <p className="text-xs font-medium text-emerald-700">
            پیشنهاد پذیرفته شد — می‌توانید معامله را ایجاد کنید
          </p>
          <div className="mt-2 flex items-center gap-2">
            {/* DEAL-002 CTA placeholder — deal creation does not exist yet, so the button stays disabled with the «به‌زودی» hint (documented follow-up). */}
            <Button size="sm" disabled title="به‌زودی">
              ایجاد معامله
            </Button>
            <span className="text-[11px] text-emerald-600">به‌زودی</span>
          </div>
        </div>
      ) : null}

      {isPending ? (
        <div role="group" aria-label={`اقدامات ${offer.lot.title}`} className="mt-2.5 flex gap-2">
          {isSeller ? (
            <>
              <Button
                size="sm"
                className="flex-1"
                disabled={act.isPending}
                onClick={() => act.mutate({ offer, action: 'accept' })}
              >
                پذیرش
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                disabled={act.isPending}
                onClick={() => onCounter?.(offer)}
              >
                پیشنهاد متقابل
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                disabled={act.isPending}
                onClick={() => act.mutate({ offer, action: 'reject' })}
              >
                رد
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="ms-auto border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
              disabled={act.isPending}
              onClick={() => act.mutate({ offer, action: 'cancel' })}
            >
              لغو پیشنهاد
            </Button>
          )}
        </div>
      ) : null}
    </Card>
  );
}
