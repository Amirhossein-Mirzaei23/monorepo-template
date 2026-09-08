import { z } from 'zod';
import type { OfferStatus } from '@monorepo/shared-types';
import { formatFaDigits } from '@/lib/format';
import { normalizeNumericInput } from '@/features/marketplace';

/**
 * OFR-004 — the offers UI's zod mirror of the API's create/counter rules
 * (OFR-001/002 constants): unitPrice 1..2B Toman integer, quantity within the
 * LOT's live bounds (the factory takes them — the same bounds the stepper
 * enforces and the server revalidates at write time), note ≤ 500 code points.
 * Form fields are the raw INPUT strings (fa digits tolerated via
 * normalizeNumericInput — the marketplace filters precedent); the parsed
 * output feeds the POST bodies directly.
 */

/** Persian display labels for the Offer status enum — the web's own copy of
 * apps/api/src/modules/offers/offers.constants.ts OFFER_STATUS_LABELS_FA (API
 * constants are server-side and cannot be imported across apps). Keys are
 * exhaustive per enum (Record<Enum, string> keeps the map compile-time synced
 * with the generated OfferStatus). */
export const OFFER_STATUS_LABELS_FA: Record<OfferStatus, string> = {
  PENDING: 'در انتظار پاسخ',
  COUNTERED: 'پیشنهاد متقابل',
  ACCEPTED: 'پذیرفته شده',
  REJECTED: 'رد شده',
  CANCELLED: 'لغو شده',
  EXPIRED: 'منقضی شده',
};

/** Toman bounds for the negotiated unit price (mirror of the API constants). */
export const OFFER_MIN_UNIT_PRICE = 1;
export const OFFER_MAX_UNIT_PRICE = 2_000_000_000;
/** The derived totalPrice ceiling — the API rejects unitPrice × quantity past
 * it (PRICE_OUT_OF_RANGE); the mirror catches it client-side. */
export const OFFER_MAX_TOTAL_PRICE = 2_000_000_000;
/** Free-text note cap, counted in code points (mirror of the API constant). */
export const OFFER_NOTE_MAX_LENGTH = 500;

/** The sheet's form model — every field as the INPUTS hold it (text). */
export interface OfferFormValues {
  quantity: string;
  unitPrice: string;
  note: string;
}

/** The parsed schema output — ready for the POST bodies (trimmed note). */
export interface OfferFormParsed {
  quantity: number;
  unitPrice: number;
  note?: string;
}

/**
 * fa-tolerant integer parser for the money/quantity inputs: Persian and
 * Arabic-Indic digits normalize, thousand separators («٬» U+066C, «,») strip,
 * and ANY non-numeric remainder fails (NaN) — the zod layer reports it, never
 * silently truncates («۱۲۰abc» is invalid, not 120). Positive integers only
 * (both offer terms are integers per the API contract).
 */
export function parseFaPositiveInteger(raw: string): number {
  const normalized = normalizeNumericInput(raw);
  if (normalized === '') {
    return Number.NaN;
  }
  const value = Number(normalized);
  return Number.isInteger(value) && value > 0 ? value : Number.NaN;
}

/**
 * The form schema factory — bounds come from the resolved lot context
 * (minOrderQuantity..availableQuantity), exactly what the server revalidates
 * against at offer time (409 QUANTITY_OUT_OF_RANGE when stale). Input:
 * OfferFormValues (the raw inputs), output: OfferFormParsed (the POST terms).
 */
export function makeOfferFormSchema(bounds: { minQuantity: number; maxQuantity: number }) {
  const quantityMessage = `تعداد باید بین ${formatFaDigits(bounds.minQuantity)} تا ${formatFaDigits(bounds.maxQuantity)} باشد`;
  return z
    .object({
      quantity: z
        .string()
        .transform(parseFaPositiveInteger)
        .refine(
          (value) =>
            !Number.isNaN(value) && value >= bounds.minQuantity && value <= bounds.maxQuantity,
          quantityMessage,
        ),
      unitPrice: z
        .string()
        .transform(parseFaPositiveInteger)
        .refine(
          (value) => value >= OFFER_MIN_UNIT_PRICE && value <= OFFER_MAX_UNIT_PRICE,
          `قیمت واحد باید بین ${formatFaDigits(OFFER_MIN_UNIT_PRICE)} تا ${formatFaDigits(OFFER_MAX_UNIT_PRICE)} تومان باشد`,
        ),
      note: z
        .string()
        .max(
          OFFER_NOTE_MAX_LENGTH,
          `یادداشت حداکثر ${formatFaDigits(OFFER_NOTE_MAX_LENGTH)} نویسه است`,
        )
        .transform((raw) => {
          const trimmed = raw.trim();
          return trimmed === '' ? undefined : trimmed;
        }),
    })
    .superRefine((values, ctx) => {
      // The derived total shares the money ceiling server-side (the API answers
      // 409 PRICE_OUT_OF_RANGE) — mirrored here on the unitPrice field.
      if (
        !Number.isNaN(values.quantity) &&
        !Number.isNaN(values.unitPrice) &&
        values.quantity * values.unitPrice > OFFER_MAX_TOTAL_PRICE
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['unitPrice'],
          message: 'جمع پیشنهاد از سقف مجاز (۲ میلیارد تومان) بیشتر است',
        });
      }
    });
}

export type OfferFormSchema = ReturnType<typeof makeOfferFormSchema>;
