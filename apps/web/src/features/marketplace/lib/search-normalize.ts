/**
 * MKT-007 — client-side search-input normalization. This is the ONE place the
 * web app normalizes a search query; the SEARCH API has its own server-side
 * mirror (`normalizeFaQuery` in apps/api/src/modules/lots/lots.constants.ts,
 * MKT-003) — keep the two replacement tables in sync when a pair is added.
 *
 * Why the client normalizes at all (the server normalizes anyway): the URL
 * the user lands on must match what they typed semantically («تیشرت» and
 * «تی‌شرت» produce the SAME shareable /lots?q=… link), recent-search dedupe
 * needs one canonical form (lib/recent-searches.ts), and the min-length hint
 * must not count a lone ZWNJ or an Arabic yeh as a real character.
 *
 * Mirrors the server table exactly: fa digits ۰-۹ → 0-9, Arabic yeh/kaf
 * (ي/ك) → Persian (ی/ک), ZWNJ (نیم‌فاصله) removed, whitespace collapsed —
 * DELIBERATELY ABSENT there (Arabic-Indic ٠-٩, آ/ا folding) is absent here.
 */

/** Pairs applied in order — mirror of the API's FA_QUERY_REPLACEMENTS. */
const FA_SEARCH_REPLACEMENTS: ReadonlyArray<readonly [string, string]> = [
  ['۰', '0'],
  ['۱', '1'],
  ['۲', '2'],
  ['۳', '3'],
  ['۴', '4'],
  ['۵', '5'],
  ['۶', '6'],
  ['۷', '7'],
  ['۸', '8'],
  ['۹', '9'],
  ['ي', 'ی'],
  ['ك', 'ک'],
  ['\u200c', ''],
];

/**
 * Raw user input → canonical search query: replacements above, whitespace
 * runs collapsed, trimmed. Empty string means "no query".
 */
export function normalizeSearchInput(input: string): string {
  let normalized = input;
  for (const [from, to] of FA_SEARCH_REPLACEMENTS) {
    normalized = normalized.split(from).join(to);
  }
  return normalized.replace(/\s+/g, ' ').trim();
}

/**
 * Minimum query length the SEARCH API accepts (MKT-003: q < 2 chars → 400
 * «جستجو حداقل ۲ کاراکتر») — the UI hints BEFORE submitting instead of
 * paying a round-trip for a guaranteed 400.
 */
export const SEARCH_QUERY_MIN_LENGTH = 2;
