'use client';

import type { JSX } from 'react';
import { useAuthUser } from '@/lib/use-auth';
import { ROLE } from '@/lib/role-access';
import { OpsDashboard } from '@/components/dashboard/OpsDashboard';
import { AdminDashboard } from '@/components/dashboard/AdminDashboard';
import { MunicipalOverview } from '@/components/dashboard/MunicipalOverview';
import { RolePlaceholderDashboard } from '@/components/dashboard/RolePlaceholderDashboard';

/**
 * One home route for every console role; each role gets its own content
 * (docs/AGAP_Role_Rules_and_Dashboard_Content.md §0). Roles without incident
 * access never render incident lists; the LGU account sees aggregate counts only.
 */
export default function DashboardPage(): JSX.Element | null {
  const user = useAuthUser();

  switch (user?.role) {
    case ROLE.DISPATCHER:
    case ROLE.SUPERVISOR:
      return <OpsDashboard />;

    case ROLE.SYS_ADMIN:
      return <AdminDashboard />;

    case ROLE.PUBLISHER:
      return <MunicipalOverview />;

    case ROLE.ORG_ADMIN:
      return (
        <RolePlaceholderDashboard
          title="Organization Administration"
          subtitle={user.orgName ?? 'Your organization'}
        >
          <p className="text-sm text-agap-textMid">
            Organization tools (your units, members, resource requests and the barangay
            directory) are being set up for this role. For account changes in the meantime,
            contact the System Administrator.
          </p>
        </RolePlaceholderDashboard>
      );

    default:
      // Hospital users are sent to their portal by AuthGate; nothing renders before sign-in.
      return null;
  }
}
