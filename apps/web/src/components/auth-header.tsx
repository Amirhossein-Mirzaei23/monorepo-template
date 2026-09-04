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
    toast('خارج شدید', 'info');
    router.push('/');
  };

  const statusText = user
    ? `${user.name} · ${user.role}`
    : status === 'loading'
      ? 'در حال بارگذاری…'
      : 'وارد نشده‌اید';

  return (
    <header className="bg-card flex items-center gap-4 border-b px-6 py-3">
      <span className="me-auto font-bold">راکدشو</span>
      <span className="text-muted-foreground text-sm">{statusText}</span>
      <Button variant="secondary" size="sm" onClick={() => void onLogout()}>
        خروج
      </Button>
    </header>
  );
}
