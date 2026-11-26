import type { JSX } from 'react';
import { MapPinned } from 'lucide-react';
import { AdminPage } from '@/components/admin/AdminSections';
import { RiskAreasTab } from '@/components/admin/RiskAreasTab';

/** Not in the System Administrator's sidebar any more; the address still opens for support. */
export default function AdminRiskAreasPage(): JSX.Element {
  return (
    <AdminPage
      title="Risk Areas"
      icon={<MapPinned />}
      module="MOD-51"
      description="Read-only. Supervisors add, change and approve risk areas from the Risk Map."
    >
      <RiskAreasTab canManage={false} />
    </AdminPage>
  );
}
