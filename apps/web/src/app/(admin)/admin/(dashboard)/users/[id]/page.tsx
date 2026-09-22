import type { Metadata } from 'next';
import { AdminUserDetail } from '@/features/admin';

export const metadata: Metadata = { title: 'جزئیات کاربر' };

interface AdminUserDetailRouteProps {
  params: Promise<{ id: string }>;
}

/**
 * Admin panel Task 05 — the /admin/users/[id] route: a thin composition over
 * the feature (the chat thread route precedent). Interactive actions run
 * client-side through the BFF behind the guarded admin shell.
 */
export default async function AdminUserDetailRoute({ params }: AdminUserDetailRouteProps) {
  const { id } = await params;
  return <AdminUserDetail userId={id} />;
}
