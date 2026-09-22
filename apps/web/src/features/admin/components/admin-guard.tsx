'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { status, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'authenticated' && user?.role !== 'ADMIN') {
      router.replace('/');
    }
  }, [router, status, user?.role]);

  if (status !== 'authenticated' || user?.role !== 'ADMIN') return null;
  return <>{children}</>;
}
