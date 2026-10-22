import type { JSX } from 'react';
import { AdminPage, UsersTab } from '@/components/admin/AdminSections';

export default function AdminUsersPage(): JSX.Element {
  return (
    <AdminPage title="Users & Accounts" description="MOD-49 · Create, activate, deactivate and review accounts">
      <UsersTab />
    </AdminPage>
  );
}
