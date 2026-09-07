/**
 * Central env access (doc/ARCHITECTURE.md → Environments & Config).
 * NEXT_PUBLIC_* is read at build time and may reach the client bundle;
 * server-only values (API_URL) are read at runtime on the server only.
 */
export const publicApiUrl: string = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/**
 * Public origin of the web app itself (share links, absolute /l/{code} URLs —
 * MKT-010). Empty when unset, which defers to `window.location.origin`
 * client-side (features/marketplace/lib/share.ts).
 */
export const publicAppUrl: string = process.env.NEXT_PUBLIC_APP_URL ?? '';

/** Server-side API base used by the BFF route handlers (never shipped to the client). */
export const serverApiUrl: string = process.env.API_URL ?? publicApiUrl;
