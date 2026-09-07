import { normalizeSearchInput, SEARCH_QUERY_MIN_LENGTH } from '../lib/search-normalize';

/**
 * MKT-007 — the client normalizer must stay in lockstep with the server's
 * normalizeFaQuery (MKT-003): both sides see the SAME canonical query, so the
 * URL a user shares and the URL the API was asked for are identical strings.
 */
describe('normalizeSearchInput', () => {
  it('converts Persian digits to Latin digits', () => {
    expect(normalizeSearchInput('پیراهن ۵۰ عدد')).toBe('پیراهن 50 عدد');
  });

  it('folds Arabic yeh/kaf onto the Persian forms', () => {
    expect(normalizeSearchInput('كتاب ي')).toBe('کتاب ی');
  });

  it('removes the ZWNJ so «تی‌شرت» and «تیشرت» normalize identically', () => {
    expect(normalizeSearchInput('تی\u200cشرت')).toBe('تیشرت');
    expect(normalizeSearchInput('تی‌شرت')).toBe(normalizeSearchInput('تیشرت'));
  });

  it('collapses whitespace runs and trims the ends', () => {
    expect(normalizeSearchInput('  کفش   ورزشی  ')).toBe('کفش ورزشی');
  });

  it('reduces whitespace-only or ZWNJ-only input to an empty string', () => {
    expect(normalizeSearchInput('   ')).toBe('');
    expect(normalizeSearchInput('\u200c')).toBe('');
  });

  it('keeps the API minimum at 2 characters (MKT-003)', () => {
    expect(SEARCH_QUERY_MIN_LENGTH).toBe(2);
  });
});
