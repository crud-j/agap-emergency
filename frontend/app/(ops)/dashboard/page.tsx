'use client';

import type { JSX } from 'react';
import { useAuthUser } from '@/lib/use-auth';
import { ROLE } from '@/lib/role-access';
import { OpsDashboard } from '@/components/dashboard/OpsDashboard';
import { AdminDashboard } from '@/components/dashboard/AdminDashboard';
import { MunicipalOverview } from '@/components/dashboard/MunicipalOverview';
import { SupervisorDashboard } from '@/components/dashboard/SupervisorDashboard';
import { OrgDashboard } from '@/components/dashboard/OrgDashboard';

/**
 * One home route for every console role; each role gets its own content
 * (docs/AGAP_Role_Rules_and_Dashboard_Content.md §0). Roles without incident
 * access never render incident lists; the LGU account sees aggregate counts only.
 */
export default function DashboardPage(): JSX.Element | null {
  const user = useAuthUser();

  switch (user?.role) {
    case ROLE.DISPATCHER:
      return <OpsDashboard />;

    case ROLE.SUPERVISOR:
      return <SupervisorDashboard />;

    case ROLE.SYS_ADMIN:
      return <AdminDashboard />;

    case ROLE.PUBLISHER:
      return <MunicipalOverview />;

    case ROLE.ORG_ADMIN:
      return <OrgDashboard />;

    default:
      // Hospital users are sent to their portal by AuthGate; nothing renders before sign-in.
      return null;
  }
}
