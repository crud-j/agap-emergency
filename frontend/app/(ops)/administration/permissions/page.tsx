import type { JSX } from 'react';
import { AdminPage, PermissionsTab } from '@/components/admin/AdminSections';

export default function AdminPermissionsPage(): JSX.Element {
  return (
    <AdminPage title="Roles & Permissions" description="MOD-47 · Permission catalog per role">
      <PermissionsTab />
    </AdminPage>
  );
}
