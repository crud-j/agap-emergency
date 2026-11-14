import type { JSX } from 'react';
import { AdminPage } from '@/components/admin/AdminSections';
import { RiskAreasTab } from '@/components/admin/RiskAreasTab';

export default function AdminRiskAreasPage(): JSX.Element {
  return (
    <AdminPage
      title="Risk Areas"
      description="Read-only. Supervisors add, change and approve risk areas from the Risk Map (MOD-51)"
    >
      <RiskAreasTab canManage={false} />
    </AdminPage>
  );
}
