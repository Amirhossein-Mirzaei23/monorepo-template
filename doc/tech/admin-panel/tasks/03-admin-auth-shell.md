# Task 03 — Admin Authentication, Route Gate, and Shell

**Phase:** A — Secure foundation  
**Objective:** Give admins a dedicated password-login flow and role-gated RTL workspace without weakening the existing HTTP-only refresh-token model.

## Files

- Create: `apps/web/src/app/(admin)/admin/login/page.tsx`
- Create: `apps/web/src/app/(admin)/admin/layout.tsx`
- Create: `apps/web/src/app/(admin)/admin/page.tsx` (shell placeholder only)
- Create: `apps/web/src/features/admin/api/admin-auth-api.ts`
- Create: `apps/web/src/features/admin/components/admin-login-form.tsx`
- Create: `apps/web/src/features/admin/components/admin-shell.tsx`
- Create: `apps/web/src/features/admin/components/admin-guard.tsx`
- Create/modify: `apps/web/src/features/admin/index.ts`
- Modify: `apps/web/src/providers/auth-provider.tsx` to expose a password-session login path without persisting the access token
- Modify: `apps/web/src/middleware.ts` matcher for `/admin/:path*`
- Test: admin auth/shell component tests and `apps/web/src/__tests__/middleware.test.ts`

## Steps (TDD)

1. Write failing tests for anonymous deep-link redirect, USER denial, ADMIN access, invalid credentials, refresh restoration, and logout.
2. Add Zod email/password schema and a login mutation against existing `/api/auth/login`; ensure `login(payload)` updates in-memory auth state.
3. Build `/admin/login` with Persian copy, LTR email/password inputs, autocomplete attributes, generic 401 errors, and no seeded credential hints outside development docs.
4. Extend middleware to gate refresh-cookie presence while exempting `/admin/login`; do not encode role in a JS-readable cookie.
5. Build `AdminGuard` that waits for restoration and requires `user.role === 'ADMIN'`; API 403 remains authoritative.
6. Build responsive RTL shell navigation to overview/users/lots/reports/verifications/deals/categories/audit, with active state and logout.
7. Verify direct refresh/deep links and stale-cookie behavior in a browser test.

## Verification

```bash
npm test -w @monorepo/web -- --runInBand src/features/admin src/__tests__/middleware.test.ts
npm run typecheck -w @monorepo/web
npm run build -w @monorepo/web
```

## Completion checklist

- [x] Normal OTP login remains unchanged.
- [x] Admin credentials use only `POST /auth/login` through the BFF.
- [x] Access token stays memory-only; refresh stays HTTP-only.
- [x] Anonymous, USER, and ADMIN routes behave per matrix.
- [x] Shell is keyboard-accessible and responsive.
