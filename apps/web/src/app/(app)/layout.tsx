import { AuthHeader } from '@/components/auth-header';
import { OnboardingGuard } from '@/features/onboarding';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <AuthHeader />
      <OnboardingGuard />
      <main className="mx-auto w-full max-w-(--app-max-width) flex-1 p-6">{children}</main>
    </div>
  );
}
