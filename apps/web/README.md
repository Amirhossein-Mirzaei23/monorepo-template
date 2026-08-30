# apps/web — Next.js Frontend (feature-based)

App Router app. See `../../doc/ARCHITECTURE.md`.

## Structure

- `src/app/` — routes and layouts only (thin): `(auth)`, `(dashboard)` route groups,
  error boundaries, and the BFF (`src/app/api/auth/*` proxies to the api)
- `src/features/<feature>/` — feature-owned components, hooks, api, schemas; public API via `index.ts`; reference: `src/features/auth`
- `src/components/ui/` — app-level shared components (wraps `@monorepo/ui`, toasts)
- `src/lib/` — api client (typed `ApiError`), BFF helper, config, pino logger
- `src/providers/` — react-query (staleTime 60s / retry 1), theme, auth session
- `src/middleware.ts` — route protection (refresh-cookie presence gate)

## Scripts

| Script                    | What it does                                 |
| ------------------------- | -------------------------------------------- |
| `npm run dev`             | next dev on :3000                            |
| `npm run build` / `start` | production build / serve (standalone output) |
| `npm test` / `test:cov`   | Jest + Testing Library (jsdom)               |

Rules: no cross-feature deep imports (enforced by the shared ESLint boundary rule);
server components by default; forms via react-hook-form + zod; mutations report via
toasts; access tokens stay in memory — only the httpOnly refresh cookie persists.
