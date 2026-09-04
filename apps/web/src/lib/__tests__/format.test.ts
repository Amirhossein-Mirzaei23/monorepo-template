import { formatFaDigits, formatJalali, formatToman } from '../format';

/**
 * Expectations match Node's full-icu fa-IR output (verified on Node 22):
 * digits ۰-۹ with U+066C group separator; persian calendar era. Dates use
 * midday UTC so the calendar day is identical in Asia/Tehran and UTC CI hosts.
 */
describe('formatToman', () => {
  it('formats with Persian digits, fa-IR grouping and the Toman unit', () => {
    expect(formatToman(180000000)).toBe('۱۸۰٬۰۰۰٬۰۰۰ تومان');
  });

  it('formats amounts below the grouping threshold without separators', () => {
    expect(formatToman(999)).toBe('۹۹۹ تومان');
  });

  it('formats zero', () => {
    expect(formatToman(0)).toBe('۰ تومان');
  });
});

describe('formatFaDigits', () => {
  it('converts Latin digits to Persian digits', () => {
    expect(formatFaDigits('Order 42 shipped')).toBe('Order ۴۲ shipped');
  });

  it('converts all ten Latin digits', () => {
    expect(formatFaDigits('0123456789')).toBe('۰۱۲۳۴۵۶۷۸۹');
  });

  it('leaves Persian digits and non-digits untouched', () => {
    expect(formatFaDigits('۱۲۳ abc-۰۴')).toBe('۱۲۳ abc-۰۴');
  });

  it('accepts numbers', () => {
    expect(formatFaDigits(1404)).toBe('۱۴۰۴');
  });
});

describe('formatJalali', () => {
  it('formats a Date on the persian calendar with Persian digits', () => {
    expect(formatJalali(new Date('2026-01-01T12:00:00.000Z'))).toBe('۱۴۰۴/۱۰/۱۱');
  });

  it('accepts ISO strings and timestamps', () => {
    expect(formatJalali('2026-01-01T12:00:00.000Z')).toBe('۱۴۰۴/۱۰/۱۱');
    expect(formatJalali(new Date('2026-01-01T12:00:00.000Z').getTime())).toBe('۱۴۰۴/۱۰/۱۱');
  });
});
