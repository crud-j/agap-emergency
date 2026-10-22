import type { JSX } from 'react';
import { AdminPage } from '@/components/admin/AdminSections';
import { IntegrationsList } from '@/components/admin/HealthSections';

export default function AdminIntegrationsPage(): JSX.Element {
  return (
    <AdminPage title="Integrations" description="MOD-49 · SMS gateway, push notifications and maps">
      <IntegrationsList />
    </AdminPage>
  );
}
