import { formatFaDigits, formatJalali, formatRelativeTimeFa, formatToman } from '../format';

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

describe('formatRelativeTimeFa', () => {
  const NOW = new Date('2026-09-05T12:00:00.000Z');

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW.getTime());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reads sub-minute ages (and clock skew) as «چند لحظه پیش»', () => {
    expect(formatRelativeTimeFa(new Date('2026-09-05T11:59:30.000Z'))).toBe('چند لحظه پیش');
    expect(formatRelativeTimeFa(new Date('2026-09-05T12:00:10.000Z'))).toBe('چند لحظه پیش');
  });

  it('formats minutes with Persian digits', () => {
    expect(formatRelativeTimeFa(new Date('2026-09-05T11:55:00.000Z'))).toBe('۵ دقیقه پیش');
  });

  it('formats hours', () => {
    expect(formatRelativeTimeFa(new Date('2026-09-05T09:00:00.000Z'))).toBe('۳ ساعت پیش');
  });

  it('formats days', () => {
    expect(formatRelativeTimeFa(new Date('2026-09-03T12:00:00.000Z'))).toBe('۲ روز پیش');
  });

  it('falls back to the Jalali date beyond the 7-day horizon', () => {
    const then = new Date('2026-08-06T12:00:00.000Z');
    expect(formatRelativeTimeFa(then)).toBe('۱۴۰۵/۵/۱۵');
    expect(formatRelativeTimeFa(then)).toBe(formatJalali(then));
  });

  it('accepts ISO strings and timestamps', () => {
    expect(formatRelativeTimeFa('2026-09-05T09:00:00.000Z')).toBe('۳ ساعت پیش');
    expect(formatRelativeTimeFa(new Date('2026-09-05T09:00:00.000Z').getTime())).toBe('۳ ساعت پیش');
  });
});
