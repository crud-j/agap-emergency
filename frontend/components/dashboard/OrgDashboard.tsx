'use client';

import type { JSX } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Inbox, Truck, Wrench } from 'lucide-react';
import { Badge, StatCard } from '@/components/ui';
import { DashboardBanners } from '@/components/dashboard/DashboardBanners';
import { DashboardPanel } from '@/components/dashboard/DashboardPanel';
import { useAuthUser } from '@/lib/use-auth';
import { titleCase, priorityLabel } from '@/lib/incident-format';
import { useResources } from '@/features/resources/hooks';
import { useMutualAidRequests } from '@/features/incidents/command-hooks';

/** Units that are out on a call (anything not at base and not out of service). */
const OUT_OF_SERVICE = new Set(['OUT_OF_SERVICE', 'OFFLINE']);

const STATUS_ORDER = [
  'AVAILABLE', 'RESERVED', 'DISPATCHED', 'EN_ROUTE', 'ON_SCENE', 'TRANSPORTING', 'RETURNING', 'OUT_OF_SERVICE', 'OFFLINE',
];

const OPEN_PREVIEW = 5;

/**
 * Org Administrator dashboard (MOD-27/35, role dashboards plan Phase 6): the
 * organization's units by status and the mutual-aid requests it can answer.
 * Unit and request data only; no incident or personal data.
 */
export function OrgDashboard(): JSX.Element {
  const user = useAuthUser();
  const orgId = user?.orgId;

  const unitsQ = useResources(orgId ? { organization_id: orgId, perPage: 200 } : { perPage: 200 });
  const openQ = useMutualAidRequests({ status: 'PENDING' });

  // Without an organization there is nothing "own" to count; don't show other orgs' units as ours.
  const units = orgId ? (unitsQ.data?.data ?? []) : [];
  const available = units.filter((u) => u.status === 'AVAILABLE').length;
  const outOfService = units.filter((u) => OUT_OF_SERVICE.has(u.status)).length;
  const answerable = (openQ.data?.data ?? []).filter((r) => r.requesting_org_id !== orgId);

  const byStatus = STATUS_ORDER.map((status) => ({
    status,
    count: units.filter((u) => u.status === status).length,
  })).filter((s) => s.count > 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-bold leading-tight tracking-tight text-agap-textMain">Organization Administration</h1>
        <p className="mt-0.5 text-[13px] text-agap-textSub">{user?.orgName ?? 'No organization linked'}</p>
      </div>

      <DashboardBanners />

      {!orgId && (
        <p className="rounded-xl bg-agap-amberSoft px-4 py-3 text-sm text-agap-amber">
          Your account is not linked to an organization. Ask the System Administrator to add you to it.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Our units" value={unitsQ.isError ? '—' : units.length} icon={<Truck size={17} />} loading={unitsQ.isLoading} />
        <StatCard label="Available" value={unitsQ.isError ? '—' : available} icon={<CheckCircle2 size={17} />} loading={unitsQ.isLoading} />
        <StatCard label="Out of service" value={unitsQ.isError ? '—' : outOfService} icon={<Wrench size={17} />} loading={unitsQ.isLoading} />
        <Link href="/resources/requests" className="rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-agap-green">
          <StatCard label="Open requests" value={openQ.isError ? '—' : answerable.length} icon={<Inbox size={17} />} loading={openQ.isLoading} />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <DashboardPanel
          title="Our units by status"
          action={
            <Link href="/operations/fleet" className="flex items-center gap-1 text-[12px] font-semibold text-agap-green hover:text-agap-green/80">
              Fleet &amp; Units <ArrowRight size={13} />
            </Link>
          }
        >
          {unitsQ.isError ? (
            <p className="text-sm text-agap-danger">Couldn&apos;t load units.</p>
          ) : byStatus.length === 0 && !unitsQ.isLoading ? (
            <p className="text-sm text-agap-textSub">No units registered for this organization yet.</p>
          ) : (
            <ul className="space-y-2">
              {byStatus.map(({ status, count }) => (
                <li key={status} className="flex items-center justify-between text-sm">
                  <span className="text-agap-textMid">{titleCase(status)}</span>
                  <span className="font-bold tabular-nums text-agap-textMain">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </DashboardPanel>

        <DashboardPanel
          title="Open mutual-aid requests"
          action={
            <Link href="/resources/requests" className="flex items-center gap-1 text-[12px] font-semibold text-agap-green hover:text-agap-green/80">
              Requests <ArrowRight size={13} />
            </Link>
          }
          bodyClassName="px-0 py-0"
        >
          {openQ.isError ? (
            <p className="px-5 py-4 text-sm text-agap-danger">Couldn&apos;t load requests.</p>
          ) : answerable.length === 0 && !openQ.isLoading ? (
            <p className="px-5 py-4 text-sm text-agap-textSub">No open requests from other organizations.</p>
          ) : (
            <ul className="divide-y divide-agap-track/15">
              {answerable.slice(0, OPEN_PREVIEW).map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-agap-textMain">
                      {r.quantity} × {titleCase(r.resource_type)}
                    </p>
                    <p className="truncate text-[11px] text-agap-textSub">
                      {r.requesting_org?.short_name ?? r.requesting_org?.name ?? 'Unknown organization'}
                    </p>
                  </div>
                  <Badge variant={r.priority === 'CRITICAL' ? 'red' : r.priority === 'HIGH' ? 'amber' : 'muted'}>
                    {priorityLabel(r.priority)}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </DashboardPanel>
      </div>
    </div>
  );
}
