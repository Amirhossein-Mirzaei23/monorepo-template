# Categories module

Scaffolded in the shape of `npm run gen:module` (plop was unavailable in the
sandbox — files mirror `scripts/templates/module` and `modules/users`).
Reference pattern: `apps/api/src/modules/users`.

## Endpoints

| Method | Path                            | Auth            | Notes                                                                     |
| ------ | ------------------------------- | --------------- | ------------------------------------------------------------------------- |
| GET    | `/categories`                   | public          | two-level tree, active only, (sortOrder, nameFa)                          |
| POST   | `/admin/categories`             | ADMIN (CAT-004) | create; `sortOrder` omitted = append after siblings                       |
| PATCH  | `/admin/categories/:id`         | ADMIN (CAT-004) | nameFa/nameEn/slug/parentId/isActive (no `sortOrder` — use /reorder)      |
| PATCH  | `/admin/categories/:id/reorder` | ADMIN (CAT-004) | sibling `sortOrder` swap (`{ siblingId }`, same parentId incl. both-null) |

There is deliberately **no DELETE**: deactivation (`isActive: false`) is the
lifecycle — inactive rows disappear from the public tree but stay resolvable
by id for historical lots, and the parent FK stays `onDelete: Restrict`.

## Business rules (CAT-001)

- Taxonomy is exactly two levels; the depth guard is service-level
  (`resolveTopLevelParent`), not a DB constraint.
- `slug` is unique, kebab-case (`CATEGORY_SLUG_REGEX`, hand-rolled — no slug
  library).
- `nameFa` is required (2–50 chars); `nameEn` is optional.
- Inactive categories are hidden from the public tree but stay resolvable by
  id for historical lots (`repository.findById` has no `isActive` filter).
- Parent FK is `onDelete: Restrict` — deleting a parent with children must be
  an explicit two-step admin action; deactivation is the normal lifecycle.
- Re-parenting (CAT-004) only targets top-level parents; a category that
  already has children can never be nested (its children would hit depth 3).

## CAT-004 note — AuditLog follow-up

The CAT-004 card calls for AuditLog rows (`category:update` etc.) on admin
writes, but the `AuditLog` model does not exist in `prisma/schema.prisma` yet.
No migration was added out of scope; audit writes are a follow-up for the task
that introduces the model (wire them into
`CategoriesService.create/update/reorder`).
