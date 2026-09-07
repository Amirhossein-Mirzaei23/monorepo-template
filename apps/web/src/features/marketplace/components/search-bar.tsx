'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { History, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  addRecentSearch,
  clearRecentSearches,
  readRecentSearches,
  removeRecentSearch,
} from '../lib/recent-searches';
import { normalizeSearchInput, SEARCH_QUERY_MIN_LENGTH } from '../lib/search-normalize';

/**
 * MKT-007 — the marketplace search bar. Submit normalizes the input
 * (lib/search-normalize.ts — the client mirror of the API's normalizeFaQuery)
 * and navigates to `/lots?q=…`, so every search is a shareable URL the browse
 * page already consumes (MKT-006); a 1-effective-char query shows the
 * «حداقل ۲ کاراکتر» hint instead of paying a round-trip for the API's 400.
 *
 * While focused with an empty input, the device-local recent searches
 * (lib/recent-searches.ts, localStorage — max 8, per-item removable, clear
 * all) drop down; picking one navigates and bubbles it to the top. The
 * dropdown closes on outside blur/Escape; mousedown-preventDefault on the
 * in-panel buttons keeps input focus so panel clicks never race the blur.
 *
 * `initialQuery` prefills from the URL q on /lots deep links — pass it with
 * `key={q}` from the page so back/forward keeps the input in URL sync.
 * The search-from-home placement itself lands with MKT-004.
 */
export interface SearchBarProps {
  /** The URL's current q — prefills the input on /lots?q=… links. */
  initialQuery?: string;
}

export function SearchBar({ initialQuery = '' }: SearchBarProps) {
  const router = useRouter();
  const inputId = useId();
  const hintId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState(initialQuery);
  const [recents, setRecents] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  const normalized = normalizeSearchInput(query);
  const showHint = normalized.length === 1;

  /** Shared by submit and recent-pick: remember, close, navigate. */
  const search = (rawQuery: string) => {
    setRecents(addRecentSearch(window.localStorage, rawQuery));
    setOpen(false);
    inputRef.current?.blur();
    router.push(`/lots?${new URLSearchParams({ q: normalizeSearchInput(rawQuery) }).toString()}`);
  };

  return (
    <div
      className="relative w-full"
      onBlur={(event) => {
        const { relatedTarget } = event;
        if (!(relatedTarget instanceof Node) || !event.currentTarget.contains(relatedTarget)) {
          setOpen(false);
        }
      }}
    >
      <form
        role="search"
        className="flex items-start gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (normalized.length >= SEARCH_QUERY_MIN_LENGTH) {
            search(query);
          }
        }}
      >
        <div className="relative flex-1">
          <Search
            className="text-muted-foreground pointer-events-none absolute inset-y-0 start-3 my-auto size-4"
            aria-hidden="true"
          />
          <label htmlFor={inputId} className="sr-only">
            جستجو در لات‌ها
          </label>
          <Input
            id={inputId}
            ref={inputRef}
            type="text"
            inputMode="search"
            autoComplete="off"
            value={query}
            placeholder="جستجو در لات‌ها…"
            className="h-11 rounded-xl ps-10 pe-11"
            aria-describedby={showHint ? hintId : undefined}
            onFocus={() => {
              setRecents(readRecentSearches(window.localStorage));
              setOpen(true);
            }}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setOpen(false);
              }
            }}
          />
          {query.length > 0 ? (
            <button
              type="button"
              aria-label="پاک کردن جستجو"
              className="text-muted-foreground hover:text-foreground absolute inset-y-0 end-1 my-auto grid size-9 place-items-center rounded-full"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setQuery('')}
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <Button type="submit" className="h-11 rounded-xl px-5">
          جستجو
        </Button>
      </form>

      {showHint ? (
        <p id={hintId} aria-live="polite" className="text-muted-foreground mt-1.5 text-xs">
          حداقل ۲ کاراکتر
        </p>
      ) : null}

      {open && query.trim() === '' && recents.length > 0 ? (
        <div className="border-border bg-card absolute inset-x-0 top-full z-10 mt-2 rounded-xl border p-1 shadow-sm">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-muted-foreground text-xs font-medium">جستجوهای اخیر</span>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground text-xs"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                clearRecentSearches(window.localStorage);
                setRecents([]);
                inputRef.current?.focus();
              }}
            >
              پاک کردن همه
            </button>
          </div>
          <ul aria-label="جستجوهای اخیر">
            {recents.map((recent) => (
              <li key={recent} className="flex items-center">
                <button
                  type="button"
                  className="hover:bg-accent flex min-h-11 flex-1 items-center gap-2 rounded-lg px-3 text-start text-sm"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => search(recent)}
                >
                  <History className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{recent}</span>
                </button>
                <button
                  type="button"
                  aria-label={`حذف «${recent}»`}
                  className="text-muted-foreground hover:text-foreground grid min-h-11 w-11 shrink-0 place-items-center rounded-full"
                  onClick={() => setRecents(removeRecentSearch(window.localStorage, recent))}
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
