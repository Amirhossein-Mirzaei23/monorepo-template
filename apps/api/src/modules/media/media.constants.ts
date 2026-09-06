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

/** Machine-readable error codes carried on error bodies (MEDIA-001/002). */
export const MEDIA_ERROR_CODES = {
  /** Key failed the pattern/traversal guard (never leaks a filesystem path). */
  INVALID_MEDIA_KEY: 'INVALID_MEDIA_KEY',
  /** Upload mime outside MEDIA_MIME_EXTENSIONS (MEDIA-002). */
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  /** Bytes don't match the declared multipart mime — forged file (MEDIA-002). */
  MEDIA_TYPE_MISMATCH: 'MEDIA_TYPE_MISMATCH',
  /** Explicit size check on the buffered upload (MEDIA-002; multer also caps at 413). */
  IMAGE_TOO_LARGE: 'IMAGE_TOO_LARGE',
  /** Per-user daily upload quota exhausted (MEDIA-002). */
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  /** sharp failed to decode/encode — partial storage already rolled back (MEDIA-002). */
  IMAGE_PROCESSING_FAILED: 'IMAGE_PROCESSING_FAILED',
} as const;

/**
 * MEDIA-002 rate limit for POST /media (uploads are expensive: bytes in,
 * sharp variants out) — 30/min per identity, mirroring the card's "e.g.
 * 30/min" and feeding @Throttle like AUTH-003's OTP_REQUEST_THROTTLE.
 */
export const MEDIA_UPLOAD_THROTTLE = { limit: 30, ttlMs: 60_000 } as const;

/**
 * MEDIA-002 variant widths — WebP q80, aspect preserved, never upscaled
 (withoutEnlargement). Cover feeds lot cards/detail, thumb feeds grids/mobile.
 */
export const MEDIA_VARIANT_WIDTHS = { cover: 1200, thumb: 480 } as const;
export const MEDIA_VARIANT_WEBP_QUALITY = 80;

/**
 * MEDIA-002 derived variant keys: original `{yyyy}/{mm}/{id}.{srcExt}` →
 * `{yyyy}/{mm}/{id}c.webp` (cover) and `{yyyy}/{mm}/{id}t.webp` (thumb).
 * Appending one letter INSIDE the id segment keeps every key inside the
 * public pattern (`[a-z0-9]+`) while making both variant keys derivable from
 * the row's storageKey alone — the schema has no coverKey column and this
 * card adds no migration ("Database: none"). Derived keys are 25 chars, so
 * they can never collide with a freshly minted 24-char id, and c/t suffixes
 * can't collide with each other.
 */
export function deriveVariantKey(originalKey: string, variant: 'cover' | 'thumb'): string {
  const dot = originalKey.lastIndexOf('.');
  const suffix = variant === 'cover' ? 'c' : 't';
  return `${originalKey.slice(0, dot)}${suffix}.webp`;
}

/**
 * Reverse of MEDIA_MIME_EXTENSIONS for SERVING rowless variant objects: a key
 * stored without its own MediaAsset row (cover/thumb of MEDIA-002 uploads)
 * has a server-minted extension, so the served content-type is derived from
 * the KEY — never from any request header (the MEDIA-001 contract stays
 * closed: request-supplied types are never trusted).
 */
export function mimeFromKeyExtension(key: string): string | undefined {
  const extension = key.slice(key.lastIndexOf('.') + 1).toLowerCase();
  const entry = Object.entries(MEDIA_MIME_EXTENSIONS).find(([, ext]) => ext === extension);
  return entry?.[0];
}

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
