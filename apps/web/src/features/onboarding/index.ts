/**
 * Public API (barrel) of the onboarding feature — the only import path other
 * modules may use (doc/ARCHITECTURE.md → Frontend rules). The step field
 * components are exported for the profile feature's reuse (PROF-001): the
 * settings form renders the same identity/seller-extras/interests/links fields
 * as the wizard.
 */
export { OnboardingWizard } from './components/onboarding-wizard';
export { OnboardingGuard } from './components/onboarding-guard';
export { useCategories } from './hooks/use-categories';
export { useSaveOnboarding } from './hooks/use-save-onboarding';
export { StepIdentity } from './components/steps/step-identity';
export { StepSellerExtras } from './components/steps/step-seller-extras';
export { StepInterests } from './components/steps/step-interests';
export { StepLinks } from './components/steps/step-links';
export {
  onboardingFormSchema,
  SELLER_BUSINESS_TYPE_LABELS_FA,
  type OnboardingFormData,
  type OnboardingStepId,
} from './schemas/onboarding-schema';
