import { z } from 'zod';

/**
 * OTP login schemas (AUTH-004) — zod mirrors of the API's OtpRequestDto /
 * OtpVerifyDto rules (`apps/api/src/modules/auth/dto/otp-*.dto.ts`). Persian
 * keyboards emit Eastern-Arabic digits, so every OTP input is normalized to
 * ASCII digits before it reaches validation or the BFF.
 */

/** Iranian mobile number shape, identical to the API's USER_PHONE_REGEX. */
export const OTP_PHONE_REGEX = /^09\d{9}$/;

/** Converts Persian (۰-۹) and Arabic-Indic (٠-٩) digits to ASCII 0-9. */
export function toEnglishDigits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, (digit) => {
    const code = digit.charCodeAt(0);
    // ۰ is U+06F0, ٠ is U+0660 — both map onto ASCII digits by offset.
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

/** Phone as typed on a Persian keyboard: `۰۹۱۲…` → `0912…`. */
export const otpPhoneSchema = z
  .string()
  .transform(toEnglishDigits)
  .pipe(z.string().regex(OTP_PHONE_REGEX, 'شماره موبایل را با فرمت ۰۹XXXXXXXXX وارد کنید'));

/** Verification code as typed on a Persian keyboard: exactly 6 ASCII digits. */
export const otpCodeSchema = z
  .string()
  .transform(toEnglishDigits)
  .pipe(z.string().regex(/^\d{6}$/, 'کد تأیید ۶ رقمی است'));

export const otpRequestSchema = z.object({ phone: otpPhoneSchema });
export const otpVerifySchema = z.object({ code: otpCodeSchema });

export type OtpRequestFormData = z.input<typeof otpRequestSchema>;
export type OtpVerifyFormData = z.input<typeof otpVerifySchema>;
