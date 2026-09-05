# apps/web — Next.js Frontend (feature-based)

App Router app. See `../../doc/ARCHITECTURE.md`.

## Structure

- `src/app/` — routes and layouts only (thin): `(auth)`, `(public)`, `(app)` route groups,
  error boundaries, and the BFF (`src/app/api/auth/*` proxies to the api)
- `src/features/<feature>/` — feature-owned components, hooks, api, schemas; public API via `index.ts`; reference: `src/features/auth`
- `src/components/ui/` — shadcn/ui components (button, input, label, card, form) + toast provider; add more via `npx shadcn@latest add <component>`
- `src/lib/` — api client (typed `ApiError`), BFF helper, config, pino logger
- `src/providers/` — react-query (staleTime 60s / retry 1), theme, auth session
- `src/middleware.ts` — route protection (refresh-cookie presence gate)

## Login flow

`src/features/auth` implements the two-step phone OTP login (Persian, RTL — there is no
email/password form for users):

1. **Phone step** — `09xxxxxxxxx` input (fa digits are normalized to en); submits through the
   feature's mutation hooks to the BFF route `src/app/api/auth/otp/request`, which proxies
   `POST /auth/otp/request` on the api.
2. **Code step** — six-digit input with auto-submit, masked phone display, edit-phone link and
   a 120 s resend countdown; submits to `src/app/api/auth/otp/verify`, which proxies
   `POST /auth/otp/verify`.

On success the verify BFF route re-issues the httpOnly refresh cookie (same handling as the
legacy login route — the token never reaches client JS) and the client routes to the `next`
param, or `/onboarding` when `onboardingCompleted=false`, else `/dashboard`. Admins use the
retained email + password path — `POST /auth/login` on the api is admin-only and is proxied by
the BFF route `src/app/api/auth/login` (no admin login form in the web UI).

## Scripts

| Script                    | What it does                                 |
| ------------------------- | -------------------------------------------- |
| `npm run dev`             | next dev on :3000                            |
| `npm run build` / `start` | production build / serve (standalone output) |
| `npm test` / `test:cov`   | Jest + Testing Library (jsdom)               |

Rules: no cross-feature deep imports (enforced by the shared ESLint boundary rule);
server components by default; forms via react-hook-form + zod; mutations report via
toasts; access tokens stay in memory — only the httpOnly refresh cookie persists.
