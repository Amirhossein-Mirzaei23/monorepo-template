# Categories module

Scaffolded in the shape of `npm run gen:module` (plop was unavailable in the
sandbox — files mirror `scripts/templates/module` and `modules/users`).
Reference pattern: `apps/api/src/modules/users`.

## Endpoints

| Method | Path          | Auth   | Notes                                            |
| ------ | ------------- | ------ | ------------------------------------------------ |
| GET    | `/categories` | public | two-level tree, active only, (sortOrder, nameFa) |

Admin writes (`POST /admin/categories`, `PATCH …/:id`, `/reorder`) are CAT-004
and will live in a separate `@Roles(ADMIN)` controller under this module.
`CategoriesService.create` already enforces the shared guards (depth ≤ 2,
top-level parent, slug uniqueness) so CAT-004 only wires routing + AuditLog.

## Business rules (CAT-001)

- Taxonomy is exactly two levels; the depth guard is service-level
  (`resolveTopLevelParent`), not a DB constraint.
- `slug` is unique, kebab-case (`CATEGORY_SLUG_REGEX`, hand-rolled — no slug
  library).
- `nameFa` is required (2–50 chars); `nameEn` is optional.
- Inactive categories are hidden from the public tree but stay resolvable by
  id for historical lots (`repository.findById` has no `isActive` filter).
- Parent FK is `onDelete: Restrict` — deleting a parent with children must be
  an explicit two-step admin action (CAT-004); deactivation is the normal
  lifecycle.
