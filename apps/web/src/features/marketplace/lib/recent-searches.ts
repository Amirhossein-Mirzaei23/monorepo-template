/**
 * MKT-007 — recent-searches store: the device-local memory of the search bar
 * (card: "recent searches — localStorage, fa, max 8, removable"). Pure
 * functions over an injectable `StorageLike` so tests run against a fake and
 * the component simply passes `window.localStorage`; every function degrades
 * to a no-op-safe read (corrupt JSON, non-array storage, quota errors) —
 * losing recents must never break the search bar.
 *
 * Entries are stored MOST-RECENT-FIRST as the RAW text the user typed (fa) —
 * that is what gets re-displayed — while DEDUPE keys on the normalized form
 * (lib/search-normalize.ts), so «تیشرت» and «تی‌شرت» collapse into one entry
 * whose text is the latest typing.
 */
import { normalizeSearchInput } from './search-normalize';

/** The subset of DOM Storage the store needs (window.localStorage satisfies it). */
export interface RecentSearchesStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const RECENT_SEARCHES_KEY = 'rakdsho:recent-searches';

/** Card cap — older entries fall off the tail as new ones are prepended. */
export const RECENT_SEARCHES_MAX = 8;

/** Reads the stored list (most-recent-first). Never throws; bad data → []. */
export function readRecentSearches(storage: RecentSearchesStorage): string[] {
  try {
    const raw = storage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .slice(0, RECENT_SEARCHES_MAX);
  } catch {
    return [];
  }
}

/**
 * Prepends `query` (deduped by normalized form, capped at max). Returns the
 * resulting list; a query under the API minimum is still stored — the list
 * mirrors intent, submission is what enforces the length.
 */
export function addRecentSearch(storage: RecentSearchesStorage, query: string): string[] {
  const text = query.trim();
  if (text.length === 0) {
    return readRecentSearches(storage);
  }
  const canonical = normalizeSearchInput(text);
  const next = [
    text,
    ...readRecentSearches(storage).filter((entry) => {
      return normalizeSearchInput(entry) !== canonical;
    }),
  ].slice(0, RECENT_SEARCHES_MAX);
  persist(storage, next);
  return next;
}

/** Removes one entry (matched on its normalized form). Returns the resulting list. */
export function removeRecentSearch(storage: RecentSearchesStorage, query: string): string[] {
  const canonical = normalizeSearchInput(query);
  const next = readRecentSearches(storage).filter(
    (entry) => normalizeSearchInput(entry) !== canonical,
  );
  persist(storage, next);
  return next;
}

/** Clears every recent search for this device. */
export function clearRecentSearches(storage: RecentSearchesStorage): void {
  try {
    storage.removeItem(RECENT_SEARCHES_KEY);
  } catch {
    // Storage unavailable/unwritable — recents are best-effort by contract.
  }
}

function persist(storage: RecentSearchesStorage, entries: string[]): void {
  try {
    if (entries.length === 0) {
      storage.removeItem(RECENT_SEARCHES_KEY);
      return;
    }
    storage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(entries));
  } catch {
    // Quota/private-mode failures stay silent — the in-memory return value
    // still drives this render; the next read falls back gracefully.
  }
}
