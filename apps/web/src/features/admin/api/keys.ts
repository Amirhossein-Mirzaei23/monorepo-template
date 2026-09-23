/** Query keys for the admin feature (TanStack Query). */
export const adminKeys = {
  all: ['admin'] as const,
  /** The one bounded workload overview of GET /admin/overview. */
  overview: () => [...adminKeys.all, 'overview'] as const,
  /** The /admin/users search list — the filter object is part of the key
   * (ROADMAP_REFERENCE §7) so linkable URL states map to distinct caches. */
  users: (filters: Record<string, unknown>) => [...adminKeys.all, 'users', filters] as const,
  /** The /admin/users/:id allowlisted detail. */
  user: (id: string) => [...adminKeys.all, 'users', 'detail', id] as const,
  /** The FULL category tree of GET /admin/categories (Task 06) — active and
   * inactive rows with lot counts. */
  categories: () => [...adminKeys.all, 'categories'] as const,
};
