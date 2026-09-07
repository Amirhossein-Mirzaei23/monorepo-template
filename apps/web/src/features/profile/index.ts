/**
 * Public API (barrel) of the profile feature — the only import path other
 * modules may use (doc/ARCHITECTURE.md → Frontend rules).
 */
export { ProfileEditView } from './components/profile-edit-view';
export { ProfileMetrics } from './components/profile-metrics';
export { AvatarSlot } from './components/avatar-slot';
export {
  PublicSellerProfileView,
  type PublicSellerProfileViewProps,
} from './components/public-seller-profile';
export { SellerShareButton, SellerShareSheet } from './components/seller-share';
export { useMyProfile } from './hooks/use-my-profile';
export { useUpdateProfile } from './hooks/use-update-profile';
export { fetchSellerServer } from './api/public-seller-api';
export { profileKeys } from './api/keys';
export {
  profileFormSchema,
  toProfileFormState,
  toUpdatePayload,
  type ProfileFormData,
  type ProfileFormState,
} from './schemas/profile-schema';
/**
 * Test fixtures (PROF-002) — contract-shaped payloads for suites OUTSIDE the
 * feature (route-group page tests cannot deep-import into features/, so the
 * fixture travels through the barrel like every other export; the
 * zod-validated page test then fails loudly if the fixture drifts from the
 * generated contract).
 */
export { sellerProfileFixture, sellerCategoryFixture } from './testing/fixtures';
