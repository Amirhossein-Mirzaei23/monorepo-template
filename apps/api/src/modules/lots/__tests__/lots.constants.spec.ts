import { FA_QUERY_REPLACEMENTS, normalizeFaQuery } from '../lots.constants';

/**
 * MKT-003 — the shared Persian query normalizer. These are the contract the
 * SQL mirror (LotsRepository.faNormalizedSql) must reproduce: both sides are
 * generated from FA_QUERY_REPLACEMENTS, so a pair added there without a test
 * here is a drift.
 */
describe('normalizeFaQuery (MKT-003)', () => {
  it('makes «تیشرت» and «تی‌شرت» equal — ZWNJ removed for matching', () => {
    expect(normalizeFaQuery('تیشرت')).toBe('تیشرت');
    expect(normalizeFaQuery('تی‌شرت')).toBe('تیشرت');
    expect(normalizeFaQuery('تیشرت')).toBe(normalizeFaQuery('تی‌شرت'));
  });

  it('maps Persian digits ۰-۹ to ASCII 0-9', () => {
    expect(normalizeFaQuery('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789');
    expect(normalizeFaQuery('پیراهن ۵۰ عددی')).toBe('پیراهن 50 عددی');
  });

  it('folds Arabic yeh/kaf onto the Persian forms («كفش ورزشي» → «کفش ورزشی»)', () => {
    expect(normalizeFaQuery('كفش ورزشي')).toBe('کفش ورزشی');
    expect(normalizeFaQuery('كفش ورزشي')).toBe(normalizeFaQuery('کفش ورزشی'));
  });

  it('applies every replacement together (digits + yeh + ZWNJ in one string)', () => {
    expect(normalizeFaQuery('تي‌شرت ۱۲')).toBe('تیشرت 12');
  });

  it('trims and collapses whitespace runs', () => {
    expect(normalizeFaQuery('  lots   of\t\nspace  ')).toBe('lots of space');
  });

  it('leaves plain latin text untouched', () => {
    expect(normalizeFaQuery('iPhone 13 Pallet')).toBe('iPhone 13 Pallet');
  });

  it('is idempotent', () => {
    const samples = ['تی‌شرت مردانه', 'كفش ۴۰', '  iPhone  \n 13 ', 'پیراهن'];
    for (const sample of samples) {
      expect(normalizeFaQuery(normalizeFaQuery(sample))).toBe(normalizeFaQuery(sample));
    }
  });

  it('keeps the replacement table pairs well-formed (non-empty source)', () => {
    for (const [from, to] of FA_QUERY_REPLACEMENTS) {
      expect(from).toHaveLength(1);
      expect(to.length).toBeLessThanOrEqual(1);
    }
  });
});
