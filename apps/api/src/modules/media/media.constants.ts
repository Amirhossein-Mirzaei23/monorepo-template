import { randomBytes } from 'node:crypto';

/**
 * MEDIA-001 storage-key contract. A key is the driver-relative POSIX path of
 * one stored object: `{yyyy}/{mm}/{cuid}.{ext}` — the id is random (below) so
 * keys are unguessable and filenames never influence storage. `secure/`-prefixed
 * keys are chat media (CHT) served only behind JWT (GET /media/secure/:key);
 * plain keys are lot images/avatars served publicly (GET /media/:key).
 */

/** Public keys: exactly `{yyyy}/{mm}/{id}.{ext}` (MEDIA-001 card regex). */
export const MEDIA_PUBLIC_KEY_PATTERN = /^\d{4}\/\d{2}\/[a-z0-9]+\.\w{2,5}$/;

/**
 * Secure (chat) keys: the same shape with a MANDATORY `secure/` prefix. On the
 * wire the path after /media IS the storage key, so GET /media/secure/... can
 * only ever resolve secure/-prefixed assets — a public asset is not reachable
 * by splicing /secure/ into its URL.
 */
export const MEDIA_SECURE_KEY_PATTERN = /^secure\/\d{4}\/\d{2}\/[a-z0-9]+\.\w{2,5}$/;

/** Path prefix that marks an asset as bearer-only (chat attachments). */
export const MEDIA_SECURE_PREFIX = 'secure/';

/**
 * Extension is derived from the STORED mime at key-generation time (MEDIA-002
 * uploads pass the sniffed mime here — never the client filename). The map is
 * the upload-type allowlist: anything else (incl. application/octet-stream)
 * is rejected at upload time. Serving, in contrast, always reads the mime
 * back from the MediaAsset row.
 */
export const MEDIA_MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
} as const;

/** Machine-readable error codes carried on 400 bodies (MEDIA-001). */
export const MEDIA_ERROR_CODES = {
  /** Key failed the pattern/traversal guard (never leaks a filesystem path). */
  INVALID_MEDIA_KEY: 'INVALID_MEDIA_KEY',
  /** Upload mime outside MEDIA_MIME_EXTENSIONS (enforced from MEDIA-002 on). */
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
} as const;

/**
 * Random object id inside a storage key: 24 lowercase base36 chars from
 * crypto.randomBytes — hand-rolled like generateLotCode (no nanoid/cuid2
 * dependency). 36^24 ≈ 2.8e37 makes guessing/collisions infeasible; rejection
 * sampling keeps `byte % 36` unbiased (36 × 7 = 252).
 */
const MEDIA_ID_LENGTH = 24;
const BASE36 = '0123456789abcdefghijklmnopqrstuvwxyz';
const BASE36_REJECT_THRESHOLD = 252;

export function generateMediaId(): string {
  let id = '';
  while (id.length < MEDIA_ID_LENGTH) {
    for (const byte of randomBytes(MEDIA_ID_LENGTH)) {
      if (byte >= BASE36_REJECT_THRESHOLD) {
        continue;
      }
      id += BASE36[byte % BASE36.length];
      if (id.length === MEDIA_ID_LENGTH) {
        return id;
      }
    }
  }
  return id;
}
