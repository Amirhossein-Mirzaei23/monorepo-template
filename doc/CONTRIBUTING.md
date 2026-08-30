# Contributing

## Branch naming

- `feat/<scope>-<description>` — e.g. `feat/api-orders-module`
- `fix/<scope>-<description>` — e.g. `fix/web-login-redirect`
- `chore/<description>` — tooling, deps, docs

## Commits

Conventional Commits, enforced by commitlint on every commit:

```
feat(api): add orders module
fix(web): redirect after successful login
chore(deps): bump next to 16.3.3
```

Scopes in use: `api`, `web`, `ui`, `shared-types`, `deps`, `ci`, `doc`.

## Pull request checklist

- [ ] One logical change (one TASKS.md item per PR when possible)
- [ ] `npm run lint && npm run typecheck && npm run test` pass locally
- [ ] New endpoints: DTOs annotated, swagger regenerated (`npm run gen:types`) and committed
- [ ] New domains/features scaffolded with `gen:module` / `gen:feature` (mirrors reference patterns)
- [ ] Tests: unit tests for services, e2e for controllers, component tests for feature components
- [ ] No secrets committed (`.env` only; `.env.example` updated instead)
- [ ] `doc/TASKS.md` checked off and affected READMEs updated in the same change
- [ ] Accessibility: no new jsx-a11y violations; interactive elements keyboard-navigable

## Local workflow

```bash
npm ci
npm run docker:up            # Postgres
npm run dev                  # api + web
```

Pre-commit runs `lint-staged` (eslint --fix + prettier); commit-msg runs commitlint.
Husky hooks are installed automatically by `npm ci` (`prepare` script).
