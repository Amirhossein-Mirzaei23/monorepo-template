'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useMe } from '@/features/auth';
import { useAuth } from '@/providers/auth-provider';

/**
 * Client-side onboarding gate for the (app) shell. The card asks for a
 * server-side check, but the access token lives in memory only
 * (doc/CONVENTIONS.md → Data Fetching decision table), so the authoritative
 * onboardingCompleted flag is read through the `me` query once authenticated.
 * Admins are exempt (they administer, never onboard).
 */
export function OnboardingGuard() {
  const { status, user } = useAuth();
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status !== 'authenticated' || user?.role === 'ADMIN') {
      return;
    }
    if (me.data && me.data.onboardingCompleted === false && pathname !== '/onboarding') {
      router.replace('/onboarding');
    }
  }, [status, user?.role, me.data, pathname, router]);

  return null;
}
