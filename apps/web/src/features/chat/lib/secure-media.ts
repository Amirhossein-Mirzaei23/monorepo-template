import { publicApiUrl } from '@/lib/config';

/**
 * CHT-007 — the BEARER media URL for a chat media key. Media message rows
 * carry the asset's storage key(s) (`mediaStorageKey` / `mediaPreviewKey`);
 * their bytes must only ever load through the authenticated route
 * GET {api}/media/secure/{key} (the secure route enforces conversation
 * participation for chat-attached assets) — never through the public route.
 *
 * The route assembles its key as `secure/` + path, so a key that already
 * carries the `secure/` prefix (future chat-native uploads) is stripped here
 * to avoid a `secure/secure/…` double prefix; public-pattern keys (what the
 * MEDIA-002/003 upload endpoints mint today) pass through unchanged.
 */
export function secureMediaUrl(storageKey: string): string {
  const path = storageKey.replace(/^secure\//, '');
  return `${publicApiUrl}/media/secure/${path}`;
}

/** fa copy for the bubble error states (the API's codes, mapped web-side). */
export const MEDIA_FORBIDDEN_FA = 'دسترسی به این رسانه را ندارید';
export const MEDIA_LOAD_FAILED_FA = 'بارگذاری رسانه ناموفق بود؛ برای تلاش مجدد بزنید';
