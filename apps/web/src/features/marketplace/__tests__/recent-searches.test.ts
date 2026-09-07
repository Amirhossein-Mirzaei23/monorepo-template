import {
  addRecentSearch,
  clearRecentSearches,
  RECENT_SEARCHES_KEY,
  readRecentSearches,
  removeRecentSearch,
  RECENT_SEARCHES_MAX,
  type RecentSearchesStorage,
} from '../lib/recent-searches';

/**
 * MKT-007 — the recent-searches store: pure functions over an injectable
 * StorageLike, so these run without jsdom/localStorage (the component passes
 * window.localStorage, which satisfies the interface structurally).
 */

function fakeStorage(initial: Record<string, string> = {}): RecentSearchesStorage {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

describe('readRecentSearches', () => {
  it('returns [] when nothing is stored', () => {
    expect(readRecentSearches(fakeStorage())).toEqual([]);
  });

  it('returns the stored most-recent-first list', () => {
    const storage = fakeStorage({ [RECENT_SEARCHES_KEY]: JSON.stringify(['گوشی', 'لپ تاپ']) });
    expect(readRecentSearches(storage)).toEqual(['گوشی', 'لپ تاپ']);
  });

  it('degrades corrupt or non-array storage to []', () => {
    expect(readRecentSearches(fakeStorage({ [RECENT_SEARCHES_KEY]: '{oops' }))).toEqual([]);
    expect(readRecentSearches(fakeStorage({ [RECENT_SEARCHES_KEY]: '"just a string"' }))).toEqual(
      [],
    );
  });

  it('drops non-string members, blanks, and over-cap entries', () => {
    const entries = ['  ', 'گوشی', 42, ...Array.from({ length: 10 }, (_, i) => `q${i}`)];
    const storage = fakeStorage({ [RECENT_SEARCHES_KEY]: JSON.stringify(entries) });
    const read = readRecentSearches(storage);
    expect(read).toHaveLength(RECENT_SEARCHES_MAX);
    expect(read).toContain('گوشی');
  });
});

describe('addRecentSearch', () => {
  it('prepends the new query (most-recent-first) and persists it', () => {
    const storage = fakeStorage({ [RECENT_SEARCHES_KEY]: JSON.stringify(['قدیمی']) });
    const next = addRecentSearch(storage, 'جدید');
    expect(next).toEqual(['جدید', 'قدیمی']);
    expect(JSON.parse(storage.getItem(RECENT_SEARCHES_KEY) ?? '')).toEqual(['جدید', 'قدیمی']);
  });

  it('dedupes on the normalized form, keeping the latest raw text', () => {
    const storage = fakeStorage();
    addRecentSearch(storage, 'تی\u200cشرت');
    const next = addRecentSearch(storage, 'تیشرت');
    expect(next).toEqual(['تیشرت']);
  });

  it('caps the list at 8, dropping the oldest', () => {
    const storage = fakeStorage();
    let list: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      list = addRecentSearch(storage, `جستجوی شماره ${i}`);
    }
    expect(list).toHaveLength(8);
    expect(list[0]).toBe('جستجوی شماره 9');
    expect(list).not.toContain('جستجوی شماره 0');
  });

  it('ignores blank input but does not corrupt the store', () => {
    const storage = fakeStorage({ [RECENT_SEARCHES_KEY]: JSON.stringify(['گوشی']) });
    expect(addRecentSearch(storage, '   ')).toEqual(['گوشی']);
  });

  it('survives a throwing setItem (private mode / quota)', () => {
    const storage: RecentSearchesStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => undefined,
    };
    expect(() => addRecentSearch(storage, 'گوشی')).not.toThrow();
  });
});

describe('removeRecentSearch', () => {
  it('removes one entry, matching on the normalized form', () => {
    const storage = fakeStorage({ [RECENT_SEARCHES_KEY]: JSON.stringify(['گوشی', 'لپ تاپ']) });
    const next = removeRecentSearch(storage, 'گوشی');
    expect(next).toEqual(['لپ تاپ']);
    expect(readRecentSearches(storage)).toEqual(['لپ تاپ']);
  });

  it('removes the ZWNJ variant of a stored entry too', () => {
    const storage = fakeStorage({ [RECENT_SEARCHES_KEY]: JSON.stringify(['تی\u200cشرت']) });
    expect(removeRecentSearch(storage, 'تیشرت')).toEqual([]);
  });
});

describe('clearRecentSearches', () => {
  it('removes the storage key entirely', () => {
    const storage = fakeStorage({ [RECENT_SEARCHES_KEY]: JSON.stringify(['گوشی']) });
    clearRecentSearches(storage);
    expect(storage.getItem(RECENT_SEARCHES_KEY)).toBeNull();
    expect(readRecentSearches(storage)).toEqual([]);
  });
});
