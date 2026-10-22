import type { JSX } from 'react';
import { AdminPage } from '@/components/admin/AdminSections';
import { SecurityEvents } from '@/components/admin/SecurityEvents';

export default function AdminSecurityPage(): JSX.Element {
  return (
    <AdminPage title="Security Events" description="MOD-46 · Failed sign-ins, lockouts and account security changes">
      <SecurityEvents />
    </AdminPage>
  );
}
