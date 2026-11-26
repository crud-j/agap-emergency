'use client';

import type { JSX, ReactNode } from 'react';
import Link from 'next/link';
import {
  Activity, Ambulance, ArrowRight, ChevronRight, Hospital, IdCard, UserPlus, UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui';
import { HealthTab } from '@/components/admin/HealthSections';
import { DashboardBanners } from '@/components/dashboard/DashboardBanners';
import { useAdminUsers } from '@/features/admin/hooks';
import { useIdReviews } from '@/features/identity-verification/hooks';
import { useResources } from '@/features/resources/hooks';
import { useHospitals } from '@/features/hospitals/hooks';
import { titleCase } from '@/lib/incident-format';
import { cn } from '@/lib/utils';

const NEWEST_USERS = 5;
const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-agap-green/60 focus-visible:ring-offset-2';

/**
 * System Administrator dashboard (MOD-49), read top to bottom: what is waiting for you,
 * whether the platform is healthy, then the newest accounts. No operational incident
 * data (separation of duties).
 */
export function AdminDashboard(): JSX.Element {
  // The user list is newest first (administration.service.ts orders by created_at desc).
  const usersQuery = useAdminUsers({ page: 1, perPage: NEWEST_USERS });
  const idQuery = useIdReviews({ status: 'PENDING_REVIEW', page: 1, perPage: 1 });
  const unitsQuery = useResources();
  const hospitalsQuery = useHospitals();

  const newest = usersQuery.data?.data ?? [];
  const pendingIds = idQuery.data?.meta.total ?? 0;

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-7">
      <header>
        <h1 className="text-[22px] font-bold leading-tight tracking-tight text-agap-textMain">System Administration</h1>
        <p className="mt-1 text-[13.5px] text-agap-textSub">
          Accounts, reference data and the health of the platform. Incident work happens in the Operations Center.
        </p>
      </header>

      <DashboardBanners />

      {/* At a glance */}
      <section aria-label="At a glance" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          href="/administration/id-reviews"
          icon={IdCard}
          label="IDs waiting for review"
          value={idQuery.isError ? '—' : pendingIds}
          loading={idQuery.isLoading}
          note={pendingIds > 0 ? 'Citizens are waiting for a decision' : 'Nothing waiting'}
          tone={pendingIds > 0 ? 'attention' : 'calm'}
        />
        <Tile
          href="/administration/users"
          icon={UsersRound}
          label="Accounts"
          value={usersQuery.isError ? '—' : (usersQuery.data?.meta.total ?? 0)}
          loading={usersQuery.isLoading}
          note="Staff and citizens"
        />
        <Tile
          href="/operations/fleet"
          icon={Ambulance}
          label="Response units"
          value={unitsQuery.isError ? '—' : (unitsQuery.data?.meta.total ?? 0)}
          loading={unitsQuery.isLoading}
          note="In the fleet registry"
        />
        <Tile
          href="/hospitals"
          icon={Hospital}
          label="Hospitals & facilities"
          value={hospitalsQuery.isError ? '—' : (hospitalsQuery.data?.length ?? 0)}
          loading={hospitalsQuery.isLoading}
          note="Receiving facilities on record"
        />
      </section>

      {/* Health */}
      <section className="space-y-3">
        <SectionTitle
          icon={Activity}
          title="System health"
          description="Live checks of the database, queues, file storage and the services AGAP depends on."
        />
        <HealthTab />
      </section>

      {/* Newest accounts */}
      <section className="space-y-3">
        <SectionTitle
          icon={UserPlus}
          title="Newest accounts"
          description="The five most recent accounts, staff and citizens. Check that each new staff account has the right role."
          action={
            <Link href="/administration/users" className={cn('inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12.5px] font-semibold text-agap-green hover:bg-agap-greenSoft', FOCUS_RING)}>
              All accounts <ArrowRight size={13} aria-hidden="true" />
            </Link>
          }
        />
        <div className="overflow-hidden rounded-2xl border border-agap-track/60 bg-white shadow-card">
          {usersQuery.isError ? (
            <p className="px-5 py-4 text-sm text-agap-danger">Couldn&apos;t load accounts.</p>
          ) : usersQuery.isLoading ? (
            <ul className="divide-y divide-agap-track/30">
              {[0, 1, 2].map((i) => (
                <li key={i} className="flex items-center gap-3 px-5 py-3.5">
                  <div className="h-9 w-9 animate-pulse rounded-full bg-agap-track/60" />
                  <div className="h-4 w-48 animate-pulse rounded bg-agap-track/60" />
                </li>
              ))}
            </ul>
          ) : newest.length === 0 ? (
            <p className="px-5 py-4 text-sm text-agap-textSub">No accounts yet.</p>
          ) : (
            <ul className="divide-y divide-agap-track/30">
              {newest.map((u) => {
                const name = u.full_name ?? u.email;
                return (
                  <li key={u.id} className="flex items-center gap-3 px-5 py-3">
                    <span
                      aria-hidden="true"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-agap-greenSoft text-[13px] font-bold text-agap-green"
                    >
                      {(name ?? '?').trim().charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-agap-textMain">{name}</p>
                      <p className="truncate text-[11.5px] text-agap-textSub">{u.email}</p>
                    </div>
                    <Badge variant="muted" className="hidden sm:inline-flex">{titleCase(u.role)}</Badge>
                    <Badge variant={u.status === 'ACTIVE' ? 'green' : 'amber'}>{titleCase(u.status)}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

// ─── Building blocks ─────────────────────────────────────────────────────────

function Tile({ href, icon: Icon, label, value, note, loading, tone = 'calm' }: {
  href: string;
  icon: LucideIcon;
  label: string;
  value: number | string;
  note: string;
  loading: boolean;
  tone?: 'calm' | 'attention';
}): JSX.Element {
  const attention = tone === 'attention';
  return (
    <Link
      href={href}
      className={cn(
        'group flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-card transition-all duration-150 hover:-translate-y-0.5 hover:shadow-card-md',
        attention ? 'border-agap-amber/40' : 'border-agap-track/60',
        FOCUS_RING,
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-xl',
            attention ? 'bg-agap-amberSoft text-agap-amber' : 'bg-agap-greenSoft text-agap-green',
          )}
        >
          <Icon size={18} aria-hidden="true" />
        </span>
        <ChevronRight size={16} aria-hidden="true" className="text-agap-track transition-transform group-hover:translate-x-0.5 group-hover:text-agap-textSub" />
      </div>
      <div>
        {loading ? (
          <div className="h-8 w-14 animate-pulse rounded-lg bg-agap-track/60" />
        ) : (
          <p className={cn('text-[28px] font-bold leading-none tabular-nums', attention ? 'text-agap-amber' : 'text-agap-textMain')}>
            {value}
          </p>
        )}
        <p className="mt-1.5 text-[13px] font-semibold text-agap-textMain">{label}</p>
        <p className="text-[11.5px] text-agap-textSub">{note}</p>
      </div>
    </Link>
  );
}

function SectionTitle({ icon: Icon, title, description, action }: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}): JSX.Element {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div className="flex items-start gap-2.5">
        <Icon size={17} aria-hidden="true" className="mt-0.5 text-agap-green" />
        <div>
          <h2 className="text-[15px] font-bold text-agap-textMain">{title}</h2>
          <p className="text-[12.5px] text-agap-textSub">{description}</p>
        </div>
      </div>
      {action}
    </div>
  );
}
