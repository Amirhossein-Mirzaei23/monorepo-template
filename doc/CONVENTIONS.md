# Conventions

## Naming

- Folders: kebab-case. Files/components: kebab-case (`user-card.tsx` → `UserCard`).
- Nest files: `<domain>.service.ts`, `<domain>.controller.ts`, etc.
- React components: PascalCase named exports; avoid default exports except Next pages/layouts.

## Imports

- Order: node → external → `@monorepo/*` → absolute (`@/`) → relative.
- No relative imports across features; cross-feature imports only via `features/<f>/index.ts`.
- No deep imports into `packages/*` internals.

## TypeScript

- `strict: true`, `noUncheckedIndexedAccess`, `noImplicitOverride`.
- No `any`; `unknown` + narrowing. No non-null `!` except tests.

## Commits & Branches

- Conventional Commits (`feat(api): …`, `fix(web): …`).
- Branches: `feat/<scope>-<desc>`, `fix/<scope>-<desc>`.

## Testing

- Colocated `__tests__/` directories.
- API: unit tests for services, e2e for controllers.
- Web: component tests for feature components; hooks tested via react-hooks testing utils.
- Coverage thresholds defined per package (task 5.3), not one blanket number.

## Error Handling (web)

- Error boundaries at each route group (`app/(auth)`, `app/(public)`, `app/(app)`), never per component.
- Mutations report failures via toasts; forms show inline field errors from zod resolver.
- API errors normalized in `lib/api-client` to a typed `ApiError`; features never parse raw responses.

## Data Fetching (web)

- All server data through feature-scoped react-query hooks (`features/<f>/api/`).
- Defaults: `staleTime: 60s`, `retry: 1` (override per query, with a comment saying why).
- SSR/RSC fetching for initial page loads; client hooks for interactive views. Never fetch in both for the same data on one page.

### SSR vs client fetching — decision table

| Situation                                                | Fetch where                                                      | Why                                                            |
| -------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------- |
| First paint of a public/content page                     | Server component (RSC)                                           | no client waterfall, good SEO/LCP                              |
| Data behind auth in interactive views                    | Client hook (react-query)                                        | access token lives in memory (client-side only)                |
| Data refreshed by user interaction (filters, live lists) | Client hook                                                      | react-query cache invalidation; server would need router churn |
| Data mutated by the user                                 | Client mutation (`useMutation`)                                  | toasts + invalidations must observe the result                 |
| Same data on one page                                    | Fetch **once** (either side), pass down or share via query cache | never fetch in both for the same data                          |
| Cross-feature shared client state                        | Providers or URL state                                           | never reach into another feature's internals                   |

## Forms

- react-hook-form + zod resolver; schemas in `features/<f>/schemas/` and reused for both validation and types.

## Accessibility

- jsx-a11y rules on; no violations allowed in CI.
- All interactive elements keyboard-navigable with visible focus.

## Transactions (api)

- Services open transactions (`prisma.$transaction`); repositories accept the tx client as a parameter.
- No repository may start or commit its own transaction.

## Agent expectations (summary — full version in AGENT-GUIDE.md)

- Read `AGENTS.md` and relevant `doc/` file before changing an app.
- Follow the reference module/feature pattern (`users` module, `auth` feature).
- Prefer plop generators (`gen:module`, `gen:feature`) over manual scaffolding once Phase 10 lands.
- Run `npm run lint`, `npm run typecheck`, `npm run test` before declaring done.
