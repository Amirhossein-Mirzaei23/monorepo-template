import type { Metadata } from 'next';
import { OnboardingWizard } from '@/features/onboarding';

export const metadata: Metadata = { title: 'تکمیل پروفایل' };

export default function OnboardingPage() {
  return <OnboardingWizard />;
}
