/** Query keys for the onboarding feature (TanStack Query). */
export const onboardingKeys = {
  all: ['onboarding'] as const,
  categories: () => ['onboarding', 'categories'] as const,
};
