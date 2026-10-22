'use client';

import type { JSX, ReactNode } from 'react';
import { DashboardBanners } from '@/components/dashboard/DashboardBanners';

/**
 * Dashboard for a role whose own overview is not built yet. It deliberately shows
 * no counts: a role without access to incident data must never see "0 incidents"
 * or "All clear" (docs/plans/ROLE_DASHBOARDS_PLAN.md, Phase 1.4).
 */
export function RolePlaceholderDashboard({
  title, subtitle, children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-bold leading-tight tracking-tight text-agap-textMain">{title}</h1>
        <p className="mt-0.5 text-[13px] text-agap-textSub">{subtitle}</p>
      </div>

      <DashboardBanners />

      <div className="rounded-xl border border-agap-track/40 bg-white p-6 shadow-card">{children}</div>
    </div>
  );
}
