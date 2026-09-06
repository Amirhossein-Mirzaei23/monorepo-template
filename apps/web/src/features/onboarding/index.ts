/**
 * Public API (barrel) of the onboarding feature — the only import path other
 * modules may use (doc/ARCHITECTURE.md → Frontend rules).
 */
export { OnboardingWizard } from './components/onboarding-wizard';
export { OnboardingGuard } from './components/onboarding-guard';
export { useCategories } from './hooks/use-categories';
export { useSaveOnboarding } from './hooks/use-save-onboarding';
export {
  onboardingFormSchema,
  SELLER_BUSINESS_TYPE_LABELS_FA,
  type OnboardingFormData,
  type OnboardingStepId,
} from './schemas/onboarding-schema';
