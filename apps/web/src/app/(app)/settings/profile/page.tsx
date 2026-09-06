import type { Metadata } from 'next';
import { ProfileEditView } from '@/features/profile';

export const metadata: Metadata = { title: 'پروفایل من' };

/**
 * /settings/profile (PROF-001) — authenticated, interactive view: data flows
 * through the profile feature's react-query hooks on the client (the access
 * token lives in memory only; doc/CONVENTIONS.md decision table).
 */
export default function SettingsProfilePage() {
  return <ProfileEditView />;
}
