# Task 06 — Admin Category Management

**Phase:** B — Existing operational surfaces  
**Objective:** Turn the existing category write API into a complete two-level taxonomy editor.

## Files

- Modify: categories repository/service/controller to add `GET /admin/categories`
- Add response fields: inactive rows, parent/order metadata, direct/visible lot counts
- Create: `apps/web/src/app/api/admin/categories/**`
- Create: `apps/web/src/app/(admin)/admin/categories/page.tsx`
- Create: admin categories API/hooks/schemas/editor/dialogs/tests

## Steps (TDD)

1. Write a failing API test proving the admin tree includes inactive roots/children and counts while public `GET /categories` still hides them.
2. Implement the admin read model without changing the public payload.
3. Add Swagger response schema and regenerate types.
4. Write failing component tests for create root, create child, edit, deactivate/reactivate, reorder, conflict, and depth errors.
5. Build the tree editor with up/down controls (drag-and-drop deferred), forms for fa/en/slug/parent, and safety copy explaining that historical lots remain linked.
6. Invalidate both admin tree and public category queries after successful mutations.
7. Verify a newly activated category appears in the seller lot picker without deployment.

## Verification

```bash
npm test -w @monorepo/api -- --runInBand src/modules/categories
npm test -w @monorepo/web -- --runInBand src/features/admin src/features/categories
npm run gen:types
```

## Completion checklist

- [ ] Inactive rows are manageable but not public.
- [ ] Depth≤2, unique slug, and sibling reorder rules remain server-enforced.
- [ ] Counts are clear and not used as delete permission.
- [ ] No hard-delete UI exists.
