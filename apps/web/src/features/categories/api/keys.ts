/** Query keys for the categories feature (TanStack Query). */
export const categoryKeys = {
  all: ['categories'] as const,
  tree: () => [...categoryKeys.all, 'tree'] as const,
};
