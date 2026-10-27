import type { JSX } from 'react';
import { AdminPage } from '@/components/admin/AdminSections';
import { RiskAreasTab } from '@/components/admin/RiskAreasTab';

export default function AdminRiskAreasPage(): JSX.Element {
  return (
    <AdminPage title="Risk Areas" description="Flood, fire and other hazard areas shown on the Risk page (MOD-51)">
      <RiskAreasTab />
    </AdminPage>
  );
}
