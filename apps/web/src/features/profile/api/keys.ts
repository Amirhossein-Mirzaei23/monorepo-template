/** Query keys for the profile feature (TanStack Query). */
export const profileKeys = {
  all: ['profiles'] as const,
  me: () => [...profileKeys.all, 'me'] as const,
};
