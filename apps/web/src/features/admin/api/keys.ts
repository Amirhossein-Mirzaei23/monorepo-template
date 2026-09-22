/** Query keys for the admin feature (TanStack Query). */
export const adminKeys = {
  all: ['admin'] as const,
  /** The one bounded workload overview of GET /admin/overview. */
  overview: () => [...adminKeys.all, 'overview'] as const,
};
