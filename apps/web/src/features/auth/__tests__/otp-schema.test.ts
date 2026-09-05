import { otpRequestSchema, otpVerifySchema, toEnglishDigits } from '../schemas/otp-schema';

describe('toEnglishDigits', () => {
  it('converts Persian (Eastern-Arabic) digits', () => {
    expect(toEnglishDigits('۰۹۱۲۳۴۵۶۷۸۹')).toBe('09123456789');
  });

  it('converts Arabic-Indic digits', () => {
    expect(toEnglishDigits('٠٩١٢٣٤٥٦٧٨٩')).toBe('09123456789');
  });

  it('passes non-digit characters through untouched', () => {
    expect(toEnglishDigits('۰۹x-۷')).toBe('09x-7');
  });
});

describe('otpRequestSchema', () => {
  it('normalizes fa digits and accepts a valid 09… number', () => {
    expect(otpRequestSchema.parse({ phone: '۰۹۱۲۳۴۵۶۷۸۹' })).toEqual({
      phone: '09123456789',
    });
  });

  it('rejects a missing 09 prefix', () => {
    expect(otpRequestSchema.safeParse({ phone: '9123456789' }).success).toBe(false);
  });

  it('rejects a too-short number', () => {
    expect(otpRequestSchema.safeParse({ phone: '0912345678' }).success).toBe(false);
  });

  it('rejects non-digit input', () => {
    expect(otpRequestSchema.safeParse({ phone: '0912345678x' }).success).toBe(false);
  });
});

describe('otpVerifySchema', () => {
  it('normalizes fa digits and accepts a 6-digit code', () => {
    expect(otpVerifySchema.parse({ code: '۱۲۳۴۵۶' })).toEqual({ code: '123456' });
  });

  it('rejects a short code', () => {
    expect(otpVerifySchema.safeParse({ code: '12345' }).success).toBe(false);
  });

  it('rejects a code with letters', () => {
    expect(otpVerifySchema.safeParse({ code: '12345a' }).success).toBe(false);
  });
});
