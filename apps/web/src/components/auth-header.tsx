'use client';

import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/providers/auth-provider';

/** App-level header showing the session state and a logout action. */
export function AuthHeader() {
  const { status, user, logout } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const onLogout = async () => {
    await logout();
    toast('Signed out', 'info');
    router.push('/login');
  };

  return (
    <header className="dashboard-header">
      <span className="dashboard-brand">monorepo-template</span>
      <span className="dashboard-user" data-status={status}>
        {user ? `${user.name} · ${user.role}` : status}
      </span>
      <Button variant="secondary" size="sm" onClick={() => void onLogout()}>
        Sign out
      </Button>
    </header>
  );
}
