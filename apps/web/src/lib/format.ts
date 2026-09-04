/**
 * Persian (fa-IR) formatting helpers — the single source for money, digits
 * and Jalali dates across the app (PLAT-001; ui-patterns.md → RTL & Persian).
 * Formatters are module-level so ICU setup cost is paid once.
 */

/** Persian (Eastern Arabic) digits ۰-۹, indexed by Latin digit value. */
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

const faNumberFormat = new Intl.NumberFormat('fa-IR');
const jalaliFormat = new Intl.DateTimeFormat('fa-IR', { calendar: 'persian' });

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
