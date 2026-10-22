'use client';

import type { JSX } from 'react';
import Link from 'next/link';
import { ArrowRight, HeartPulse, Truck, Users } from 'lucide-react';
import { Badge, StatCard } from '@/components/ui';
import { HealthTab } from '@/components/admin/AdminSections';
import { DashboardBanners } from '@/components/dashboard/DashboardBanners';
import { useAdminUsers } from '@/features/admin/hooks';
import { useResources } from '@/features/resources/hooks';
import { useHospitals } from '@/features/hospitals/hooks';
import { titleCase } from '@/lib/incident-format';

const NEWEST_USERS = 5;

/**
 * System Administrator dashboard (MOD-49): platform health, registry counts and the
 * newest staff accounts. No operational incident data (separation of duties).
 */
export function AdminDashboard(): JSX.Element {
  // The user list is newest first (administration.service.ts orders by created_at desc).
  const usersQuery = useAdminUsers({ page: 1, perPage: NEWEST_USERS });
  const unitsQuery = useResources();
  const hospitalsQuery = useHospitals();

  const newest = usersQuery.data?.data ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-bold leading-tight tracking-tight text-agap-textMain">System Administration</h1>
        <p className="mt-0.5 text-[13px] text-agap-textSub">Platform health, accounts and reference data</p>
      </div>

      <DashboardBanners />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Link href="/administration/users" className="rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-agap-green">
          <StatCard
            label="Staff accounts"
            value={usersQuery.isError ? '—' : (usersQuery.data?.meta.total ?? 0)}
            icon={<Users size={17} />}
            loading={usersQuery.isLoading}
          />
        </Link>
        <Link href="/operations/fleet" className="rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-agap-green">
          <StatCard
            label="Registered units"
            value={unitsQuery.isError ? '—' : (unitsQuery.data?.meta.total ?? 0)}
            icon={<Truck size={17} />}
            loading={unitsQuery.isLoading}
          />
        </Link>
        <Link href="/hospitals" className="rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-agap-green">
          <StatCard
            label="Hospitals & facilities"
            value={hospitalsQuery.isError ? '—' : (hospitalsQuery.data?.length ?? 0)}
            icon={<HeartPulse size={17} />}
            loading={hospitalsQuery.isLoading}
          />
        </Link>
      </div>

      <section className="space-y-3">
        <h2 className="text-[13px] font-bold text-agap-textMain">System health</h2>
        <HealthTab />
      </section>

      <section className="overflow-hidden rounded-xl border border-agap-track/40 bg-white shadow-card">
        <div className="flex items-center justify-between border-b border-agap-track/30 px-5 py-3.5">
          <h2 className="text-[13px] font-bold text-agap-textMain">Newest accounts</h2>
          <Link
            href="/administration/users"
            className="flex items-center gap-1 text-[12px] font-semibold text-agap-green hover:text-agap-green/80"
          >
            View all <ArrowRight size={13} />
          </Link>
        </div>
        {usersQuery.isError ? (
          <p className="px-5 py-4 text-sm text-agap-danger">Couldn&apos;t load accounts.</p>
        ) : newest.length === 0 && !usersQuery.isLoading ? (
          <p className="px-5 py-4 text-sm text-agap-textSub">No staff accounts yet.</p>
        ) : (
          <ul className="divide-y divide-agap-track/15">
            {newest.map((u) => (
              <li key={u.id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-agap-textMain">{u.full_name ?? u.email}</p>
                  <p className="truncate text-[11px] text-agap-textSub">{u.email}</p>
                </div>
                <Badge variant="muted">{titleCase(u.role)}</Badge>
                <Badge variant={u.status === 'ACTIVE' ? 'green' : 'amber'}>{titleCase(u.status)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
