'use client';

import { useMe } from '@/features/auth';
import { useAuth } from '@/providers/auth-provider';

/**
 * Dashboard home — interactive client view backed by the auth feature's
 * react-query hook (client fetching; see doc/CONVENTIONS.md decision table).
 */
export default function DashboardPage() {
  const { status, user } = useAuth();
  const me = useMe();

  if (status === 'loading') {
    return <p className="dashboard-status">Restoring session…</p>;
  }
  if (status === 'unauthenticated') {
    return <p className="dashboard-status">Session expired — please sign in again.</p>;
  }

  const profile = me.data ?? user;
  return (
    <section>
      <h1>Dashboard</h1>
      {profile ? (
        <dl className="dashboard-profile">
          <dt>Name</dt>
          <dd>{profile.name}</dd>
          <dt>Email</dt>
          <dd>{profile.email}</dd>
          <dt>Role</dt>
          <dd>{profile.role}</dd>
        </dl>
      ) : (
        <p className="dashboard-status">Loading profile…</p>
      )}
    </section>
  );
}
