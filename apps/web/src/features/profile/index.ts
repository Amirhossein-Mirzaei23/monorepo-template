/**
 * Public API (barrel) of the profile feature — the only import path other
 * modules may use (doc/ARCHITECTURE.md → Frontend rules).
 */
export { ProfileEditView } from './components/profile-edit-view';
export { ProfileMetrics } from './components/profile-metrics';
export { AvatarSlot } from './components/avatar-slot';
export { useMyProfile } from './hooks/use-my-profile';
export { useUpdateProfile } from './hooks/use-update-profile';
export { profileKeys } from './api/keys';
export {
  profileFormSchema,
  toProfileFormState,
  toUpdatePayload,
  type ProfileFormData,
  type ProfileFormState,
} from './schemas/profile-schema';
