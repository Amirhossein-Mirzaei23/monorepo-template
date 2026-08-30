/**
 * Central env access (doc/ARCHITECTURE.md → Environments & Config).
 * NEXT_PUBLIC_* is read at build time and may reach the client bundle;
 * server-only values (API_URL) are read at runtime on the server only.
 */
export const publicApiUrl: string = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/** Server-side API base used by the BFF route handlers (never shipped to the client). */
export const serverApiUrl: string = process.env.API_URL ?? publicApiUrl;
