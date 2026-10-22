import type { JSX } from 'react';
import { AdminPage, ConfigTab } from '@/components/admin/AdminSections';

export default function AdminConfigPage(): JSX.Element {
  return (
    <AdminPage title="Configuration" description="MOD-49 · System configuration entries">
      <ConfigTab />
    </AdminPage>
  );
}
