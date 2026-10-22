import type { JSX } from 'react';
import { AdminPage, UsersTab } from '@/components/admin/AdminSections';

export default function AdminUsersPage({
  searchParams,
}: {
  searchParams: { search?: string | string[] };
}): JSX.Element {
  // Security Events links here with ?search=<name>.
  const search = typeof searchParams.search === 'string' ? searchParams.search : '';
  return (
    <AdminPage title="Users & Accounts" description="MOD-49 · Create, activate, deactivate and review accounts">
      <UsersTab key={search} initialSearch={search} />
    </AdminPage>
  );
}
