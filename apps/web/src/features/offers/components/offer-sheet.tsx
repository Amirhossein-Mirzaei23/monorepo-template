'use client';

import { useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { AlertTriangle, Loader2, Minus, Plus, RotateCcw } from 'lucide-react';
import type { OfferResponseDto } from '@monorepo/shared-types';
import { LOT_UNIT_LABELS_FA } from '@/features/marketplace';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api-client';
import { formatFaDigits, formatToman } from '@/lib/format';
import { useLotForOffer } from '../hooks/use-lot-for-offer';
import {
  offerErrorMessage,
  useSubmitOffer,
  type SubmitOfferPayload,
} from '../hooks/use-offer-actions';
import {
  makeOfferFormSchema,
  OFFER_MAX_TOTAL_PRICE,
  parseFaPositiveInteger,
  type OfferFormParsed,
  type OfferFormValues,
} from '../schemas/offer-schema';
import type { OfferSheetLot } from '../types';

/**
 * OFR-004 — the make-offer bottom sheet, the ONE form for both directions:
 *
 * - create (buyer): the CHT-008 «پیشنهاد قیمت» chip and any «پیشنهاد قیمت»
 *   entry point opens it with the lot context resolved from the public code;
 *   POST /offers carries lotId + conversationId so the ACTION message lands
 *   in the tied thread (server-side).
 * - counter (seller): the offer card's «پیشنهاد متقابل» reuses THIS sheet,
 *   seeded from the countered offer (quantity/unitPrice/note); POST
 *   /offers/:id/counter.
 *
 * Quantity stepper bounded by the LOT's live bounds (minOrderQuantity..
 * availableQuantity — resolved via use-lot-for-offer, exactly what the server
 * revalidates); unit price accepts fa digits; a live hint shows the unit
 * price + total (formatToman) against the lot's asking price. 409s surface as
 * INLINE fa banners with a «به‌روزرسانی لات» refresh hint (the card's error
 * state) — NOT toasts — because the recovery is a bounds refetch, not a retry.
 *
 * The form panel mounts ONLY while the sheet is open (Sheet unmounts its
 * children), so every open re-seeds from the current lot/offer — no effect
 * based reseeding (the FiltersSheetPanel precedent).
 */
export interface OfferSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Public lot code — the only reference chat threads and offer payloads carry. */
  lotCode: string | undefined;
  /** Present → counter mode: this PENDING offer is being countered (seller). */
  counterOffer?: OfferResponseDto;
  /** Buyer thread to tie the created offer's ACTION message into (create mode). */
  conversationId?: string;
}

export function OfferSheet({
  open,
  onOpenChange,
  lotCode,
  counterOffer,
  conversationId,
}: OfferSheetProps) {
  // The context query only runs while the sheet is open — no fetch for closed sheets.
  const lotState = useLotForOffer(lotCode, open);
  const isCounter = counterOffer !== undefined;
  const title = isCounter ? 'ارسال پیشنهاد متقابل' : 'ثبت پیشنهاد قیمت';

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title}>
      {lotState.lot ? (
        <OfferSheetForm
          lot={lotState.lot}
          counterOffer={counterOffer}
          conversationId={conversationId}
          onRefreshLot={lotState.refetch}
          onDone={() => onOpenChange(false)}
        />
      ) : lotState.isError ? (
        <div role="alert" className="grid gap-3 p-6 text-center">
          <p className="text-sm font-medium">دریافت اطلاعات لات ناموفق بود</p>
          <Button variant="outline" size="sm" className="mx-auto" onClick={lotState.refetch}>
            <RotateCcw className="size-4" aria-hidden="true" />
            تلاش مجدد
          </Button>
        </div>
      ) : (
        <div role="status" aria-label="در حال دریافت اطلاعات لات" className="grid gap-3 p-4">
          <div className="bg-muted h-4 w-2/3 animate-pulse rounded" />
          <div className="bg-muted h-9 w-full animate-pulse rounded-md" />
          <div className="bg-muted h-9 w-full animate-pulse rounded-md" />
        </div>
      )}
    </Sheet>
  );
}

interface OfferSheetFormProps {
  lot: OfferSheetLot;
  counterOffer?: OfferResponseDto;
  conversationId?: string;
  onRefreshLot: () => void;
  onDone: () => void;
}

/** The inline 409 banner model — refreshHint adds the «به‌روزرسانی لات» action. */
interface SubmitErrorState {
  message: string;
  refreshHint: boolean;
}

/** fa copy per machine error code; `refresh: true` renders the refresh hint. */
const SUBMIT_ERROR_FA: Record<string, { message: string; refresh: boolean }> = {
  LOT_NOT_ACTIVE: {
    message: 'این لات دیگر فعال نیست و ثبت پیشنهاد ممکن نیست.',
    refresh: true,
  },
  QUANTITY_OUT_OF_RANGE: {
    message: 'موجودی یا حداقل سفارش لات تغییر کرده است — تعداد را با اطلاعات جدید تنظیم کنید.',
    refresh: true,
  },
  STALE_QUANTITY: {
    message: 'موجودی لات دیگر کافی نیست — اطلاعات لات به‌روز شده است.',
    refresh: true,
  },
  OFFER_EXPIRED: {
    message: 'مهلت این پیشنهاد گذشته است — وضعیت را به‌روزرسانی کنید.',
    refresh: true,
  },
  PRICE_OUT_OF_RANGE: {
    message: 'قیمت پیشنهادی خارج از محدوده مجاز است.',
    refresh: false,
  },
};

function submitErrorState(error: unknown): SubmitErrorState {
  const fallback = { message: offerErrorMessage(error), refreshHint: false };
  if (!(error instanceof ApiError)) {
    return fallback;
  }
  const mapped = error.body?.code !== undefined ? SUBMIT_ERROR_FA[error.body.code] : undefined;
  if (mapped !== undefined && error.status === 409) {
    return { message: mapped.message, refreshHint: mapped.refresh };
  }
  return fallback;
}

function OfferSheetForm({
  lot,
  counterOffer,
  conversationId,
  onRefreshLot,
  onDone,
}: OfferSheetFormProps) {
  const isCounter = counterOffer !== undefined;
  const bounds = useMemo(
    () => ({ minQuantity: lot.minOrderQuantity, maxQuantity: lot.availableQuantity }),
    [lot.minOrderQuantity, lot.availableQuantity],
  );
  const schema = useMemo(() => makeOfferFormSchema(bounds), [bounds]);
  const submit = useSubmitOffer();
  const { toast } = useToast();
  const [submitError, setSubmitError] = useState<SubmitErrorState | null>(null);

  const lotInactive = lot.status !== 'ACTIVE';

  const form = useForm<OfferFormValues, unknown, OfferFormParsed>({
    resolver: zodResolver(schema),
    defaultValues: {
      quantity: String(counterOffer?.quantity ?? lot.minOrderQuantity),
      unitPrice: String(counterOffer?.unitPrice ?? lot.unitPrice),
      note: counterOffer?.note ?? '',
    },
  });
  const errors = form.formState.errors;

  // Live-hint mirrors (the lots wizard's onChange-state approach — no
  // form.watch, which the React Compiler cannot memoize). Parsed with the
  // SAME parser the schema uses, so the hint never disagrees with validation.
  const seedQuantity = String(counterOffer?.quantity ?? lot.minOrderQuantity);
  const seedUnitPrice = String(counterOffer?.unitPrice ?? lot.unitPrice);
  const [liveQuantity, setLiveQuantity] = useState(seedQuantity);
  const [liveUnitPrice, setLiveUnitPrice] = useState(seedUnitPrice);
  const [liveNote, setLiveNote] = useState(counterOffer?.note ?? '');
  const quantity = parseFaPositiveInteger(liveQuantity);
  const unitPrice = parseFaPositiveInteger(liveUnitPrice);
  const total = Number.isNaN(quantity) || Number.isNaN(unitPrice) ? null : quantity * unitPrice;
  const priceDeltaPercent =
    total === null || lot.unitPrice <= 0
      ? null
      : Math.round(((unitPrice - lot.unitPrice) / lot.unitPrice) * 100);

  const bumpQuantity = (delta: number) => {
    const current = parseFaPositiveInteger(liveQuantity);
    const base = Number.isNaN(current) ? lot.minOrderQuantity : current + delta;
    const clamped = Math.min(Math.max(base, lot.minOrderQuantity), lot.availableQuantity);
    const next = String(clamped);
    setLiveQuantity(next);
    form.setValue('quantity', next, { shouldValidate: form.formState.isSubmitted });
  };

  const onSubmit = form.handleSubmit((values) => {
    setSubmitError(null);
    const payload: SubmitOfferPayload = isCounter
      ? { mode: 'counter', offerId: counterOffer.id, values }
      : { mode: 'create', lotId: lot.id, conversationId, values };
    submit.mutate(
      { payload },
      {
        onSuccess: () => {
          toast(isCounter ? 'پیشنهاد متقابل ارسال شد' : 'پیشنهاد شما ثبت شد', 'success');
          onDone();
        },
        onError: (error: unknown) => {
          setSubmitError(submitErrorState(error));
        },
      },
    );
  });

  const noteLength = liveNote.length;

  return (
    // Plain register + inline error paragraphs (not the shadcn FormField): the
    // resolver TRANSFORMS the string inputs into parsed numbers, which the
    // Field generic cannot express. The register onChange hooks feed the
    // live-hint mirrors above.
    <form onSubmit={onSubmit} className="flex flex-col gap-4 p-4">
      {submitError ? (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700"
        >
          <span className="flex items-start gap-1.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {submitError.message}
          </span>
          {submitError.refreshHint ? (
            <button
              type="button"
              onClick={onRefreshLot}
              className="inline-flex w-fit cursor-pointer items-center gap-1 rounded-md px-1 font-medium underline underline-offset-2"
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
              به‌روزرسانی لات
            </button>
          ) : null}
        </div>
      ) : null}

      {lotInactive ? (
        <p
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-700"
        >
          این لات در وضعیت فعلی فعال نیست و ثبت پیشنهاد ممکن نیست.
        </p>
      ) : null}

      {/* Lot summary — the negotiation baseline (asking price) stays visible. */}
      <div className="rounded-xl border p-3">
        <p className="line-clamp-1 text-sm font-medium">{lot.title}</p>
        <p className="text-muted-foreground mt-0.5 text-xs">
          قیمت پایه: {formatToman(lot.unitPrice)} · موجودی: {formatFaDigits(lot.availableQuantity)}{' '}
          {LOT_UNIT_LABELS_FA[lot.unit]}
        </p>
      </div>

      <div>
        <label htmlFor="offer-quantity" className="mb-1.5 block text-sm font-medium">
          تعداد ({LOT_UNIT_LABELS_FA[lot.unit]})
        </label>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="کاهش تعداد"
            disabled={quantity <= lot.minOrderQuantity}
            onClick={() => bumpQuantity(-1)}
          >
            <Minus className="size-4" aria-hidden="true" />
          </Button>
          <Input
            id="offer-quantity"
            {...form.register('quantity', { onChange: (e) => setLiveQuantity(e.target.value) })}
            type="text"
            inputMode="numeric"
            placeholder={`${formatFaDigits(lot.minOrderQuantity)} تا ${formatFaDigits(lot.availableQuantity)}`}
            className="text-center"
            aria-invalid={errors.quantity !== undefined}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="افزایش تعداد"
            disabled={quantity >= lot.availableQuantity}
            onClick={() => bumpQuantity(1)}
          >
            <Plus className="size-4" aria-hidden="true" />
          </Button>
        </div>
        {errors.quantity ? (
          <p role="alert" className="mt-1.5 text-xs text-red-600">
            {errors.quantity.message}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="offer-unit-price" className="mb-1.5 block text-sm font-medium">
          قیمت واحد (تومان)
        </label>
        <div className="relative">
          <Input
            id="offer-unit-price"
            {...form.register('unitPrice', { onChange: (e) => setLiveUnitPrice(e.target.value) })}
            type="text"
            inputMode="numeric"
            placeholder={formatFaDigits(lot.unitPrice)}
            className="pe-12"
            aria-invalid={errors.unitPrice !== undefined}
          />
          <span className="text-muted-foreground pointer-events-none absolute inset-y-0 end-3 flex items-center text-xs">
            تومان
          </span>
        </div>
        {errors.unitPrice ? (
          <p role="alert" className="mt-1.5 text-xs text-red-600">
            {errors.unitPrice.message}
          </p>
        ) : null}
      </div>

      {/* Live unit-price + total hint (the card's headline requirement). */}
      <div
        role="status"
        aria-label="جمع پیشنهاد"
        className="rounded-lg bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-600"
      >
        {total === null ? (
          <span>تعداد و قیمت واحد را وارد کنید تا جمع پیشنهاد نمایش داده شود.</span>
        ) : (
          <>
            <span className="block">
              جمع پیشنهاد: <span className="font-semibold text-zinc-900">{formatToman(total)}</span>
              {total > OFFER_MAX_TOTAL_PRICE ? (
                <span className="text-red-600"> — بیشتر از سقف مجاز</span>
              ) : null}
            </span>
            {priceDeltaPercent !== null && total <= OFFER_MAX_TOTAL_PRICE ? (
              <span>
                {priceDeltaPercent === 0
                  ? 'هم‌قیمت با قیمت پایه لات'
                  : priceDeltaPercent < 0
                    ? `${formatFaDigits(Math.abs(priceDeltaPercent))}٪ کمتر از قیمت پایه`
                    : `${formatFaDigits(priceDeltaPercent)}٪ بیشتر از قیمت پایه`}
              </span>
            ) : null}
          </>
        )}
      </div>

      <div>
        <label htmlFor="offer-note" className="mb-1.5 block text-sm font-medium">
          یادداشت (اختیاری)
        </label>
        <textarea
          id="offer-note"
          {...form.register('note', { onChange: (e) => setLiveNote(e.target.value) })}
          rows={2}
          maxLength={500}
          placeholder="مثلاً: لطفاً تا آخر هفته ارسال شود"
          className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
        />
        <p className="text-muted-foreground text-end text-[11px]">
          {formatFaDigits(noteLength)}/{formatFaDigits(500)}
        </p>
        {errors.note ? (
          <p role="alert" className="mt-1.5 text-xs text-red-600">
            {errors.note.message}
          </p>
        ) : null}
      </div>

      <Button type="submit" size="lg" disabled={submit.isPending || lotInactive}>
        {submit.isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            در حال ارسال…
          </>
        ) : isCounter ? (
          'ارسال پیشنهاد متقابل'
        ) : (
          'ثبت پیشنهاد'
        )}
      </Button>
    </form>
  );
}
