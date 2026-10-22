'use client';

import type { JSX } from 'react';
import Link from 'next/link';
import { useAuthUser } from '@/lib/use-auth';
import { ROLE } from '@/lib/role-access';
import { OpsDashboard } from '@/components/dashboard/OpsDashboard';
import { AdminDashboard } from '@/components/dashboard/AdminDashboard';
import { RolePlaceholderDashboard } from '@/components/dashboard/RolePlaceholderDashboard';

/**
 * One home route for every console role; each role gets its own content
 * (docs/AGAP_Role_Rules_and_Dashboard_Content.md §0). Roles without incident
 * access never render incident counts.
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
      return (
        <RolePlaceholderDashboard
          title="Office of the Mayor — Municipal Overview"
          subtitle="Bocaue, Bulacan"
        >
          <p className="text-sm text-agap-textMid">
            The municipal overview (incident counts by barangay and category, trends and
            response performance) is coming next. Until then, manage public announcements here:
          </p>
          <Link
            href="/announcements"
            className="mt-4 inline-flex rounded-lg bg-[#126247] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0F543D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#126247]/40"
          >
            Open Announcements
          </Link>
        </RolePlaceholderDashboard>
      );

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
