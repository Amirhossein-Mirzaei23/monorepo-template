/**
 * Persian (fa-IR) formatting helpers — the single source for money, digits
 * and Jalali dates across the app (PLAT-001; ui-patterns.md → RTL & Persian).
 * Formatters are module-level so ICU setup cost is paid once.
 */

/** Persian (Eastern Arabic) digits ۰-۹, indexed by Latin digit value. */
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

const faNumberFormat = new Intl.NumberFormat('fa-IR');
const jalaliFormat = new Intl.DateTimeFormat('fa-IR', { calendar: 'persian' });
/** Per-bubble chat timestamps (CHT-006): «۱۴:۰۵» — 24h clock, Persian digits. */
const timeFormat = new Intl.DateTimeFormat('fa-IR', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** Formats an amount in Toman: 180000000 → «۱۸۰٬۰۰۰٬۰۰۰ تومان». */
export function formatToman(amount: number): string {
  return `${faNumberFormat.format(amount)} تومان`;
}

/** Converts Latin digits (0-9) to Persian digits (۰-۹); everything else passes through. */
export function formatFaDigits(input: string | number): string {
  return String(input).replace(/\d/g, (digit) => FA_DIGITS.charAt(Number(digit)));
}

/** Formats a date on the Jalali (persian) calendar: 2026-01-01 → «۱۴۰۴/۱۰/۱۱». */
export function formatJalali(date: Date | string | number): string {
  return jalaliFormat.format(date instanceof Date ? date : new Date(date));
}

/** Formats a wall-clock time with Persian digits: 14:05 → «۱۴:۰۵» (chat bubbles). */
export function formatTimeFa(date: Date | string | number): string {
  return timeFormat.format(date instanceof Date ? date : new Date(date));
}

// --- relative time (MKT-005 lot cards, conversation lists) ---
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
/** Past this horizon «X روز پیش» stops being useful — a Jalali date reads better. */
const RELATIVE_DAY_LIMIT = 7 * DAY_MS;

/**
 * Persian relative time for card/list timestamps: «چند لحظه پیش», «X دقیقه پیش»,
 * «X ساعت پیش», «X روز پیش» — then a Jalali date («۱۴۰۵/۶/۱۴») beyond the 7-day
 * horizon. Future timestamps (clock skew) read as «چند لحظه پیش».
 */
export function formatRelativeTimeFa(date: Date | string | number): string {
  const value = date instanceof Date ? date : new Date(date);
  const elapsedMs = Date.now() - value.getTime();
  if (elapsedMs < MINUTE_MS) {
    return 'چند لحظه پیش';
  }
  if (elapsedMs < HOUR_MS) {
    return `${formatFaDigits(Math.floor(elapsedMs / MINUTE_MS))} دقیقه پیش`;
  }
  if (elapsedMs < DAY_MS) {
    return `${formatFaDigits(Math.floor(elapsedMs / HOUR_MS))} ساعت پیش`;
  }
  if (elapsedMs < RELATIVE_DAY_LIMIT) {
    return `${formatFaDigits(Math.floor(elapsedMs / DAY_MS))} روز پیش`;
  }
  return formatJalali(value);
}
