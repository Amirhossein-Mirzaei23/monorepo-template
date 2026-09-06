/** Query keys for the lots feature (TanStack Query). */
export const lotKeys = {
  all: ['lots'] as const,
  /** Owner-shape detail by internal id (edit wizard / my-lots actions). */
  detail: (id: string) => [...lotKeys.all, 'detail', id] as const,
};
