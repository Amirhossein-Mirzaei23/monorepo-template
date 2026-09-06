/**
 * MEDIA-004 — client-side media limits (mirrors the PLAT-003 / MEDIA-002/003
 * server rules). Pre-checks are UX only: the server remains the source of
 * truth — a stale client must never be stricter or looser than the API.
 */

import { formatFaDigits } from '@/lib/format';

/** Max image size before upload (server rejects 413 beyond this). */
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;

/** Max video size before upload (server rejects 413 beyond this). */
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024;

/** Max video duration in ms — 60 s + the API's 1 s tolerance (422 beyond). */
export const VIDEO_MAX_DURATION_MS = 61_000;

/** Accepted video input types (mirrors the API's mp4/webm sniff allowlist). */
export const VIDEO_ACCEPT_TYPES = 'video/mp4,video/webm';

/** Formats ms as m:ss with Persian digits — 58_000 → «۰:۵۸». */
export function formatVideoDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${formatFaDigits(minutes)}:${formatFaDigits(seconds).padStart(2, '۰')}`;
}
