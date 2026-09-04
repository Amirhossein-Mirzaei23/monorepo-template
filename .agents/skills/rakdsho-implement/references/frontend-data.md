# Frontend Data Patterns — TanStack Query Only

## The one rule

**All server state goes through feature-scoped TanStack Query hooks.** No `useEffect` +
`fetch`, no axios calls sprinkled in components, no server data in component-local state.
Components render; hooks fetch and cache. This is how every card's "Frontend work" is executed.

## Feature layout (mirror `features/auth`)

```
apps/web/src/features/<feature>/
├── index.ts              # barrel — the ONLY import surface for other features
├── api/
│   ├── keys.ts           # query-key factory
│   └── <feature>-api.ts  # typed fetchers (thin, no logic)
├── hooks/                # use-<thing>.ts — useQuery / useInfiniteQuery / useMutation wrappers
├── schemas/              # zod mirrors of the API DTOs (types from @monorepo/shared-types)
├── components/           # feature UI
└── __tests__/
```

Scaffold with `npm run gen:feature`. Cross-feature imports only via `@/features/<f>` (barrel) —
the ESLint boundary rule enforces it.

## Query conventions

- Key factories in `api/keys.ts`, hierarchical and serializable:

```ts
export const lotKeys = {
  all: ['lots'] as const,
  list: (filters: LotFilters) => [...lotKeys.all, 'list', filters] as const,
  detail: (code: string) => [...lotKeys.all, 'detail', code] as const,
  mine: (status?: LotStatus) => [...lotKeys.all, 'mine', status] as const,
};
```

- Defaults from `doc/CONVENTIONS.md`: `staleTime: 60_000`, `retry: 1`; override per-query only
  with a comment saying why.
- Paginated lists use `useInfiniteQuery` (cursor/offset from the `Paginated<T>` envelope) +
  IntersectionObserver sentinel — never "load more" buttons on mobile surfaces.
- Fetchers use `apiFetch` from `lib/api-client.ts` (typed `ApiError`, request-id propagation);
  components never parse raw responses. Optional payload validation via the feature's zod
  schema + `parseApiResponse` when the card demands it.
- URL-synced view state (filters/sort/q) via `searchParams` so lists are shareable and
  back-button safe — cache keys include those filters so each URL variant caches correctly.

## Mutation conventions

- Wrap in `useMutation` inside the feature hook; onSuccess: toast (success) + invalidate the
  affected key factory scopes; onError: typed `ApiError` → toast with the API's Persian message.
- Optimistic updates where the card says so (save-heart, chat send): populate cache with a temp
  id, roll back on error, reconcile with the server echo.
- Invalidation, not refetch-everything: invalidate the narrowest keys (`lotKeys.detail(code)`,
  `lotKeys.all` for status-affecting changes).

## Transport routing

- JSON via the BFF (`app/api/*` route handlers proxying with the httpOnly refresh cookie —
  extend `lib/bff.ts` pattern per card). Access token stays in memory via the auth provider.
- File uploads go **directly to the API** (bearer + CORS, XHR for progress events) — the BFF
  stays JSON-only. The uploader components (MEDIA-004) own this path.
- Realtime (chat) via the socket.io client singleton in the chat feature; WS events invalidate
  query keys (`conversation:updated` → invalidate conversations list) rather than duplicating
  state; polling fallback re-engages automatically when the socket is down.

## SSR vs client (the repo's decision table, applied)

- Public marketplace pages (`/`, `/l/{code}`, `/c/{slug}`, `/s/{id}`): RSC server fetch for
  first paint + SEO; hydrate interactive bits with client hooks — never fetch the same data on
  both sides of one page.
- Authenticated dashboards/chat/filters: client hooks only (token lives client-side).
- Forms: react-hook-form + zod resolver, schemas in `features/<f>/schemas/`, inline field
  errors from the schema, mutation failures as toasts — exactly like `login-form.tsx`.

## Tests

- Hook tests with a wrapped `QueryClient` (fresh instance per test, `retry: false`).
- Component tests assert loading/empty/error/data states driven by the cache, with fetchers
  mocked at the api-module boundary.
