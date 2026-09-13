import { z } from 'zod';
import type { DealEventViewDto, DealResponseDto, DealStatus } from '@monorepo/shared-types';

/**
 * DEAL-004 — the deals UI's mirror of the API contract constants
 * (apps/api/src/modules/deals/deals.constants.ts): fa label maps, the
 * DISPUTE reason floor, and the ACTION VIEW the detail page renders per
 * (status, myRole). API constants are server-side and cannot be imported
 * across apps — the offers schema precedent. The label maps are exhaustive
 * per enum (Record<Enum, string> keeps them compile-time synced with the
 * generated types).
 */

export const DEAL_STATUS_LABELS_FA: Record<DealStatus, string> = {
  NEGOTIATING: 'در مذاکره',
  AGREED: 'توافق شده',
  PAYMENT_PENDING: 'در انتظار پرداخت',
  PAID: 'پرداخت شده',
  PREPARING: 'در حال آماده‌سازی',
  SHIPPED: 'ارسال شده',
  DELIVERED: 'تحویل شده',
  COMPLETED: 'تکمیل شده',
  CANCELLED: 'لغو شده',
  DISPUTED: 'در اختلاف',
};

/** The recorded-terms enums, derived from the deal payload (compile-time
 * synced like the status map above). */
export type DealDeliveryMethod = DealResponseDto['deliveryMethod'];
export type DealPaymentMethod = DealResponseDto['paymentMethod'];

export const DELIVERY_METHOD_LABELS_FA: Record<DealDeliveryMethod, string> = {
  PICKUP: 'تحویل حضوری',
  SELLER_SHIPS: 'ارسال توسط فروشنده',
  BUYER_TRANSPORT: 'حمل توسط خریدار',
  CARRIER: 'باربری',
};

export const PAYMENT_METHOD_LABELS_FA: Record<DealPaymentMethod, string> = {
  CASH: 'نقدی',
  CARD_TO_CARD: 'کارت به کارت',
  BANK_TRANSFER: 'انتقال بانکی',
  CHEQUE: 'چک',
};

/** The statuses with no participant moves left — the detail page stops
 * polling and the matrix rows are empty for these. DISPUTED is terminal for
 * the PARTICIPANTS (only DEAL-007's admin resolution moves it) but stays
 * visually prominent (action pending). */
export const TERMINAL_DEAL_STATUSES: ReadonlyArray<DealStatus> = [
  'COMPLETED',
  'CANCELLED',
  'DISPUTED',
];

/** The dispute-reason floor — mirror of DEAL_DISPUTE_REASON_MIN_LENGTH. */
export const DEAL_DISPUTE_REASON_MIN_LENGTH = 20;
/** Free-text note cap — mirror of DEAL_NOTE_MAX_LENGTH. */
export const DEAL_NOTE_MAX_LENGTH = 500;

/** The cancel-reason schema: present, non-blank, within the note cap. */
export const cancelReasonSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, 'دلیل لغو را بنویسید')
    .max(DEAL_NOTE_MAX_LENGTH, `دلیل لغو حداکثر ${DEAL_NOTE_MAX_LENGTH} نویسه است`),
});

/** The dispute-reason schema: the same cap plus the ≥ 20-char floor (the
 * API's DISPUTE_REASON_TOO_SHORT, mirrored client-side). */
export const disputeReasonSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(
      DEAL_DISPUTE_REASON_MIN_LENGTH,
      `دلیل اختلاف حداقل ${DEAL_DISPUTE_REASON_MIN_LENGTH} نویسه است`,
    )
    .max(DEAL_NOTE_MAX_LENGTH, `دلیل اختلاف حداکثر ${DEAL_NOTE_MAX_LENGTH} نویسه است`),
});

/** What a detail action does when the caller taps it. */
export type DealActionKind = 'transition' | 'payment-confirm' | 'cancel' | 'dispute';

/** One action button of the deal detail's action bar — a MIRROR of the
 * DEAL-001 matrix row (roles) + the DEAL-003 endpoint that performs it. */
export interface DealActionView {
  kind: DealActionKind;
  /** The transition target (undefined for the non-transition marks). */
  to?: DealStatus;
  /** The fa CTA copy. */
  label: string;
  /** The sides the API's matrix allows — the OTHER side's buttons render
   * disabled with the waiting hint (the card's «disabled + tooltip»). */
  roles: ReadonlyArray<'buyer' | 'seller'>;
  /** Opens the reason sheet before submitting. */
  requiresReason: boolean;
  danger?: boolean;
}

/** The full action view per status — the DEAL-001 matrix restated for the two
 * participant hats (ADMIN rows stay API-side until DEAL-007). */
const ACTIONS_BY_STATUS: Record<DealStatus, readonly DealActionView[]> = {
  NEGOTIATING: [
    {
      kind: 'transition',
      to: 'AGREED',
      label: 'پذیرش معامله',
      roles: ['buyer', 'seller'],
      requiresReason: false,
    },
    {
      kind: 'cancel',
      label: 'لغو معامله',
      roles: ['buyer', 'seller'],
      requiresReason: true,
      danger: true,
    },
    {
      kind: 'dispute',
      label: 'اعلام اختلاف',
      roles: ['buyer', 'seller'],
      requiresReason: true,
      danger: true,
    },
  ],
  AGREED: [
    {
      kind: 'transition',
      to: 'PAYMENT_PENDING',
      label: 'ورود به مرحله پرداخت',
      roles: ['buyer', 'seller'],
      requiresReason: false,
    },
    {
      kind: 'cancel',
      label: 'لغو معامله',
      roles: ['buyer', 'seller'],
      requiresReason: true,
      danger: true,
    },
    {
      kind: 'dispute',
      label: 'اعلام اختلاف',
      roles: ['buyer', 'seller'],
      requiresReason: true,
      danger: true,
    },
  ],
  PAYMENT_PENDING: [
    { kind: 'payment-confirm', label: 'پرداخت کردم', roles: ['buyer'], requiresReason: false },
    {
      kind: 'transition',
      to: 'PAID',
      label: 'تأیید دریافت پرداخت',
      roles: ['seller'],
      requiresReason: false,
    },
    { kind: 'cancel', label: 'لغو معامله', roles: ['seller'], requiresReason: true, danger: true },
    {
      kind: 'dispute',
      label: 'اعلام اختلاف',
      roles: ['buyer', 'seller'],
      requiresReason: true,
      danger: true,
    },
  ],
  PAID: [
    {
      kind: 'transition',
      to: 'PREPARING',
      label: 'آماده‌سازی سفارش',
      roles: ['seller'],
      requiresReason: false,
    },
    {
      kind: 'dispute',
      label: 'اعلام اختلاف',
      roles: ['buyer', 'seller'],
      requiresReason: true,
      danger: true,
    },
  ],
  PREPARING: [
    {
      kind: 'transition',
      to: 'SHIPPED',
      label: 'ارسال شد',
      roles: ['seller'],
      requiresReason: false,
    },
    {
      kind: 'dispute',
      label: 'اعلام اختلاف',
      roles: ['buyer', 'seller'],
      requiresReason: true,
      danger: true,
    },
  ],
  SHIPPED: [
    {
      kind: 'transition',
      to: 'DELIVERED',
      label: 'تحویل داده شد',
      roles: ['seller'],
      requiresReason: false,
    },
    {
      kind: 'dispute',
      label: 'اعلام اختلاف',
      roles: ['buyer', 'seller'],
      requiresReason: true,
      danger: true,
    },
  ],
  DELIVERED: [
    {
      kind: 'transition',
      to: 'COMPLETED',
      label: 'تأیید دریافت کالا',
      roles: ['buyer'],
      requiresReason: false,
    },
    {
      kind: 'dispute',
      label: 'اعلام اختلاف',
      roles: ['buyer', 'seller'],
      requiresReason: true,
      danger: true,
    },
  ],
  COMPLETED: [],
  CANCELLED: [],
  DISPUTED: [],
};

/** The action bar for ONE deal view: every matrix row of the current status,
 * `enabled` iff the viewer's side may perform it. Disabled rows stay visible
 * with the waiting hint — the parties always see whose move it is. */
export function dealActionsFor(
  status: DealStatus,
  myRole: 'buyer' | 'seller',
): Array<DealActionView & { enabled: boolean }> {
  return ACTIONS_BY_STATUS[status].map((action) => ({
    ...action,
    enabled: action.roles.includes(myRole),
  }));
}

/** The waiting hint for a disabled action (the tooltip copy). */
export function dealActionWaitingHint(action: DealActionView, myRole: 'buyer' | 'seller'): string {
  const other = myRole === 'buyer' ? 'فروشنده' : 'خریدار';
  return `در انتظار اقدام ${other}`;
}

/** Whether the buyer's «پرداخت کردم» mark already exists in the timeline
 * (the informational PAYMENT_PENDING→PAYMENT_PENDING event) — the API allowlist
 * does not carry the stamp, the timeline is the truth. */
export function dealPaymentAnnounced(events: DealEventViewDto[]): boolean {
  return events.some(
    (event) => event.fromStatus === 'PAYMENT_PENDING' && event.toStatus === 'PAYMENT_PENDING',
  );
}
