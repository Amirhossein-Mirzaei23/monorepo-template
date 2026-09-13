'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { formatFaDigits, formatJalali, formatToman } from '@/lib/format';
import {
  DELIVERY_METHOD_LABELS_FA,
  PAYMENT_METHOD_LABELS_FA,
  cancelReasonSchema,
  dealActionWaitingHint,
  dealActionsFor,
  dealPaymentAnnounced,
  disputeReasonSchema,
  type DealActionView,
} from '../schemas/deal-schema';
import { useDealAction } from '../hooks/use-deal-actions';
import { useDealDetail } from '../hooks/use-deals';
import { DealStatusChip } from './deal-status-chip';
import { StatusTimeline } from './status-timeline';

/**
 * DEAL-004 — the /deals/:code detail: header (lot summary link + status chip
 * + the public code), the locked-terms block (the CREATION snapshot —
 * quantity/prices/delivery/payment + the two notes), the full status
 * timeline, and the action bar that MIRRORS THE MATRIX (dealActionsFor):
 * every legal move of the current status renders; the viewer's own moves are
 * enabled, the counterpart's stay disabled with a waiting tooltip. Cancel and
 * dispute open the reason bottom sheet (zod-validated: cancel non-blank,
 * dispute ≥ 20 code points — the API's floors mirrored client-side).
 * 409s toast with the mapped fa copy and the invalidated detail re-renders
 * the real state (the card's "toast + refresh state").
 */

type ReasonSheetState = { kind: 'cancel' } | { kind: 'dispute' } | null;

export function DealDetail({ code }: { code: string }) {
  const detail = useDealDetail(code);
  const act = useDealAction();
  const [reasonSheet, setReasonSheet] = useState<ReasonSheetState>(null);

  if (detail.isLoading) {
    return (
      <div role="status" aria-label="در حال بارگذاری معامله" className="grid gap-3">
        <div className="bg-muted h-24 animate-pulse rounded-xl" />
        <div className="bg-muted h-40 animate-pulse rounded-xl" />
        <div className="bg-muted h-32 animate-pulse rounded-xl" />
      </div>
    );
  }

  if (detail.isError || detail.data === undefined) {
    return (
      <Card className="grid gap-3 p-6 text-center" data-testid="deal-detail-error">
        <p className="text-sm font-medium">دریافت معامله ناموفق بود</p>
        <p className="text-muted-foreground text-xs">اتصال خود را بررسی کنید و دوباره تلاش کنید.</p>
        <Button variant="outline" className="mx-auto" onClick={() => detail.refetch()}>
          <RotateCcw className="size-4" aria-hidden="true" />
          تلاش مجدد
        </Button>
      </Card>
    );
  }

  const deal = detail.data;
  const actions = dealActionsFor(deal.status, deal.myRole);
  const paymentAnnounced = dealPaymentAnnounced(deal.events);
  const barActions = actions.filter(
    (action) => !(action.kind === 'payment-confirm' && paymentAnnounced),
  );
  const isBusy = act.isPending;

  const submitDirect = (action: DealActionView & { enabled: boolean }) => {
    if (action.kind === 'transition' && action.to !== undefined) {
      act.mutate({ code, action: 'transition', body: { to: action.to } });
    } else if (action.kind === 'payment-confirm') {
      act.mutate({ code, action: 'payment-confirm' });
    }
  };

  return (
    <section className="mx-auto grid w-full max-w-2xl gap-3" data-testid="deal-detail">
      {/* Header: the lot summary link + lifecycle state */}
      <Card className="gap-0 p-4">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/l/${deal.lot.code}`} className="text-sm font-medium hover:underline">
            {deal.lot.title}
          </Link>
          <DealStatusChip status={deal.status} />
        </div>
        <p className="text-muted-foreground mt-1 text-[11px]">
          کد معامله {formatFaDigits(deal.code)} · {formatJalali(deal.createdAt)}
        </p>
      </Card>

      {/* The locked terms — the creation snapshot, immutable by design */}
      <Card className="gap-0 p-4" data-testid="deal-terms">
        <h2 className="text-sm font-semibold">شرایط معامله</h2>
        <dl className="mt-3 grid gap-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground text-xs">تعداد</dt>
            <dd>{formatFaDigits(deal.quantity)} عدد</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground text-xs">قیمت واحد</dt>
            <dd>{formatToman(deal.unitPrice)}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground text-xs">مبلغ کل</dt>
            <dd className="font-semibold">{formatToman(deal.totalPrice)}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground text-xs">نحوه ارسال</dt>
            <dd>{DELIVERY_METHOD_LABELS_FA[deal.deliveryMethod]}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground text-xs">روش پرداخت</dt>
            <dd>{PAYMENT_METHOD_LABELS_FA[deal.paymentMethod]}</dd>
          </div>
        </dl>
        {deal.deliveryNote !== null ? (
          <p className="mt-2 rounded-lg bg-zinc-50 px-2.5 py-1.5 text-xs leading-5 text-zinc-600">
            ارسال: {deal.deliveryNote}
          </p>
        ) : null}
        {deal.paymentTermsNote !== null ? (
          <p className="mt-2 rounded-lg bg-zinc-50 px-2.5 py-1.5 text-xs leading-5 text-zinc-600">
            پرداخت: {deal.paymentTermsNote}
          </p>
        ) : null}
      </Card>

      {/* The audit timeline */}
      <Card className="gap-0 p-4">
        <h2 className="mb-3 text-sm font-semibold">روند معامله</h2>
        <StatusTimeline events={deal.events} />
      </Card>

      {/* The action bar — the matrix mirror */}
      {barActions.length > 0 ? (
        <div
          role="group"
          aria-label="اقدامات معامله"
          className="sticky bottom-0 mt-2 rounded-xl border bg-white p-3 shadow-sm"
          data-testid="deal-action-bar"
        >
          <div className="flex flex-wrap gap-2">
            {barActions.map((action) =>
              action.enabled ? (
                <Button
                  key={action.kind + (action.to ?? '')}
                  size="sm"
                  variant={action.danger ? 'outline' : 'default'}
                  className={
                    action.danger
                      ? 'border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700'
                      : undefined
                  }
                  disabled={isBusy}
                  onClick={() => {
                    if (action.requiresReason) {
                      setReasonSheet(
                        action.kind === 'cancel' ? { kind: 'cancel' } : { kind: 'dispute' },
                      );
                    } else {
                      submitDirect(action);
                    }
                  }}
                >
                  {isBusy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                  {action.label}
                </Button>
              ) : (
                <Button
                  key={action.kind + (action.to ?? '')}
                  size="sm"
                  variant="outline"
                  disabled
                  title={dealActionWaitingHint(action, deal.myRole)}
                >
                  {action.label}
                </Button>
              ),
            )}
          </div>
        </div>
      ) : null}

      <ReasonSheet
        state={reasonSheet}
        onClose={() => setReasonSheet(null)}
        onSubmit={(reason) => {
          if (reasonSheet === null) {
            return;
          }
          if (reasonSheet.kind === 'cancel') {
            act.mutate({ code, action: 'cancel', body: { reason } });
          } else {
            act.mutate({
              code,
              action: 'transition',
              body: { to: 'DISPUTED', note: reason },
            });
          }
          setReasonSheet(null);
        }}
      />
    </section>
  );
}

/** The cancel/dispute reason bottom sheet — inline zod validation, the same
 * floors the API enforces. */
function ReasonSheet({
  state,
  onClose,
  onSubmit,
}: {
  state: ReasonSheetState;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const title = state?.kind === 'dispute' ? 'اعلام اختلاف' : 'لغو معامله';

  const submit = () => {
    const schema = state?.kind === 'dispute' ? disputeReasonSchema : cancelReasonSchema;
    const parsed = schema.safeParse({ reason });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'متن واردشده معتبر نیست');
      return;
    }
    setError(null);
    setReason('');
    onSubmit(parsed.data.reason);
  };

  return (
    <Sheet
      open={state !== null}
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={title}
    >
      <div className="grid gap-3">
        <label className="grid gap-1.5">
          <span className="text-xs font-medium">
            {state?.kind === 'dispute' ? 'دلیل اختلاف (حداقل ۲۰ نویسه)' : 'دلیل لغو'}
          </span>
          <Input
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              setError(null);
            }}
            placeholder={
              state?.kind === 'dispute'
                ? 'چه اتفاقی افتاده است؟'
                : 'چرا می‌خواهید معامله را لغو کنید؟'
            }
            aria-invalid={error !== null}
          />
        </label>
        {error !== null ? (
          <p role="alert" className="text-xs text-red-600">
            {error}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button className="flex-1" onClick={submit}>
            ثبت
          </Button>
          <Button variant="outline" className="flex-1" onClick={onClose}>
            انصراف
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
