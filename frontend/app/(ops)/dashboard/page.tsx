 'use client';

import { useMemo, type JSX } from 'react';
import Link from 'next/link';
import {
  AlertCircle, Activity, Truck, Clock, Megaphone, Siren, RefreshCw,
} from 'lucide-react';
import {
  Card, CardHeader, CardTitle, StatCard,
  PriorityBadge, StatusChip, EmptyState, SkeletonRow, Button,
} from '@/components/ui';
import { ConnectionIndicator } from '@/components/layout/ConnectionIndicator';
import { ActivityStream } from '@/components/dashboard/ActivityStream';
import { useWsState } from '@/lib/use-ws-state';
import { useIncidents } from '@/features/incidents/hooks';
import { useAvailableResources } from '@/features/resources/hooks';
import { useResponders } from '@/features/responders/hooks';
import { useSurgeState } from '@/features/surge/hooks';
import { usePublishedAnnouncements } from '@/features/announcements/hooks';
import {
  ACTIVE_STATUSES, DISPATCHABLE_STATUSES, categoryIcon, timeAgo, titleCase,
} from '@/lib/incident-format';
import type { IncidentListItem } from '@/features/incidents/api';

const RECENT_LIMIT = 8;

/**
 * MOD-21 — Emergency Operations and Dispatch Dashboard.
 *
 * Live KPI tiles + recent-incident feed for the Bocaue MDRRMO ops center.
 * All data is read through TanStack Query hooks; the SocketProvider keeps the
 * underlying caches fresh (incident.*, dispatch.*, responder.*, announcement.*),
 * so tiles and the feed update within ~1s of a backend event — no manual refresh.
 *
 * Never silently fails: the live WS state is shown in the header, each tile
 * falls back to "—" on error, and a retry strip surfaces any failed query.
 */
export default function DashboardPage(): JSX.Element {
  const wsState = useWsState();

  // perPage 100 gives a representative working set for the active/pending
  // counts and the recent feed without a dedicated stats endpoint.
  const incidentsQuery = useIncidents({ perPage: 100 });
  const availableQuery = useAvailableResources();
  const respondersQuery = useResponders({ perPage: 100 });
  const surgeQuery = useSurgeState();
  const announcementsQuery = usePublishedAnnouncements();

  const incidents: IncidentListItem[] = incidentsQuery.data?.data ?? [];
  const responders = respondersQuery.data?.data ?? [];
  const available = availableQuery.data ?? [];

  const activeCount = useMemo(
    () => incidents.filter((i) => ACTIVE_STATUSES.includes(i.status)).length,
    [incidents],
  );

  const pendingDispatchCount = useMemo(
    () => incidents.filter((i) => DISPATCHABLE_STATUSES.includes(i.status)).length,
    [incidents],
  );

  const onSceneCount = useMemo(
    () => responders.filter((r) => r.status === 'ON_SCENE').length,
    [responders],
  );

  const availableCount = available.length;

  const recent = useMemo(
    () =>
      [...incidents]
        .sort((a, b) => +new Date(b.submitted_at) - +new Date(a.submitted_at))
        .slice(0, RECENT_LIMIT),
    [incidents],
  );

  const surge = surgeQuery.data;

  const criticalAnnouncement = useMemo(
    () =>
      (announcementsQuery.data ?? []).find(
        (a) => a.severity === 'CRITICAL' && a.status === 'PUBLISHED',
      ) ?? null,
    [announcementsQuery.data],
  );

  // Never silently fail: collect failed queries for a retry strip.
  const failures = [
    { label: 'incidents', q: incidentsQuery },
    { label: 'available units', q: availableQuery },
    { label: 'responders', q: respondersQuery },
    { label: 'announcements', q: announcementsQuery },
  ].filter((f) => f.q.isError);

  function retryAll() {
    failures.forEach((f) => void f.q.refetch());
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-agap-textMain">
            Operations Dashboard
          </h1>
          <p className="mt-1 text-sm text-agap-textSub">
            Bocaue MDRRMO · live emergency operations overview
          </p>
        </div>
        <ConnectionIndicator state={wsState} />
      </div>

      {/* CRITICAL surge / announcement banners */}
      {surge?.is_active && (
        <CriticalBanner
          icon={<Siren size={20} />}
          title={
            surge.mass_casualty
              ? 'Mass-Casualty Surge Mode Active'
              : 'Disaster Surge Mode Active'
          }
          detail={[
            surge.activation_reason,
            surge.affected_barangays.length
              ? `Affected: ${surge.affected_barangays.join(', ')}`
              : null,
            `${surge.active_incident_count} active incident${
              surge.active_incident_count === 1 ? '' : 's'
            }`,
          ]
            .filter(Boolean)
            .join(' · ')}
          href="/operations/surge"
          cta="Open surge console"
        />
      )}

      {criticalAnnouncement && (
        <CriticalBanner
          icon={<Megaphone size={20} />}
          title={`Critical Advisory — ${criticalAnnouncement.title}`}
          detail={criticalAnnouncement.body}
          href="/announcements"
          cta="View announcements"
        />
      )}

      {/* Retry strip for any failed query */}
      {failures.length > 0 && (
        <Card className="flex items-center justify-between gap-4 border-[rgba(212,72,88,0.22)] bg-agap-dangerSoft">
          <div className="flex items-center gap-2 text-sm text-agap-danger">
            <AlertCircle size={16} className="shrink-0" />
            <span>
              Couldn't load {failures.map((f) => f.label).join(', ')}. Data shown
              may be incomplete.
            </span>
          </div>
          <Button variant="danger" size="sm" onClick={retryAll}>
            <RefreshCw size={14} />
            Retry
          </Button>
        </Card>
      )}

      {/* KPI tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          href="/operations/incidents"
          className="rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-agap-green"
        >
          <StatCard
            label="Active Incidents"
            value={incidentsQuery.isError ? '—' : activeCount}
            icon={<AlertCircle size={18} />}
            variant="critical"
            loading={incidentsQuery.isLoading}
          />
        </Link>

        <Link
          href="/operations/fleet"
          className="rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-agap-green"
        >
          <StatCard
            label="Responders On-Scene"
            value={respondersQuery.isError ? '—' : onSceneCount}
            icon={<Activity size={18} />}
            variant="success"
            loading={respondersQuery.isLoading}
          />
        </Link>

        <Link
          href="/operations/fleet"
          className="rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-agap-green"
        >
          <StatCard
            label="Units Available"
            value={availableQuery.isError ? '—' : availableCount}
            icon={<Truck size={18} />}
            variant="success"
            loading={availableQuery.isLoading}
          />
        </Link>

        <Link
          href="/operations/dispatch"
          className="rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-agap-green"
        >
          <StatCard
            label="Pending Dispatch"
            value={incidentsQuery.isError ? '—' : pendingDispatchCount}
            icon={<Clock size={18} />}
            variant="warning"
            loading={incidentsQuery.isLoading}
          />
        </Link>
      </div>

      {/* Recent incidents */}
      <Card padding="none" className="overflow-hidden">
        <CardHeader className="mb-0 px-5 pt-5">
          <CardTitle>Recent Incidents</CardTitle>
          <Link
            href="/operations/incidents"
            className="text-sm font-semibold text-agap-green hover:underline"
          >
            View all
          </Link>
        </CardHeader>

        <div className="mt-2 divide-y divide-[rgba(168,181,193,0.20)]">
          {incidentsQuery.isLoading ? (
            Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
          ) : incidentsQuery.isError ? (
            <EmptyState
              icon={AlertCircle}
              title="Couldn't load incidents"
              description="The incident feed is unavailable. Check your connection and retry."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void incidentsQuery.refetch()}
                >
                  <RefreshCw size={14} />
                  Retry
                </Button>
              }
            />
          ) : recent.length === 0 ? (
            <EmptyState
              title="No incidents yet"
              description="All clear — no emergency incidents have been reported in Bocaue."
            />
          ) : (
            recent.map((inc) => <IncidentRow key={inc.id} incident={inc} />)
          )}
        </div>
      </Card>

      {/* New: real events from the existing Socket.IO connection */}
      <ActivityStream />
    </div>
  );
}

// ─── Recent incident row ──────────────────────────────────────────────────────

function IncidentRow({
  incident,
}: {
  incident: IncidentListItem;
}): JSX.Element {
  const Icon = categoryIcon(incident.category);
  const location =
    incident.incident_locations?.barangay ??
    incident.incident_locations?.formatted_address ??
    null;

  return (
    <Link
      href={`/operations/incidents?focus=${incident.id}`}
      className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-agap-surface focus:outline-none focus-visible:bg-agap-surface"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-agap-greenSoft text-agap-green">
        <Icon size={18} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-bold text-agap-textMain tabular-nums">
            {incident.public_reference}
          </span>
          <span className="text-xs text-agap-textSub">
            {titleCase(incident.category)}
          </span>
        </div>
        <p className="truncate text-xs text-agap-textSub">
          {location ?? 'Location pending'}
        </p>
      </div>

      <PriorityBadge priority={incident.priority} />
      <StatusChip status={incident.status} className="hidden sm:inline-flex" />
      <span className="w-16 shrink-0 text-right text-xs text-agap-textSub tabular-nums">
        {timeAgo(incident.submitted_at)}
      </span>
    </Link>
  );
}

// ─── Critical banner ──────────────────────────────────────────────────────────

function CriticalBanner({
  icon,
  title,
  detail,
  href,
  cta,
}: {
  icon: JSX.Element;
  title: string;
  detail?: string | null;
  href: string;
  cta: string;
}): JSX.Element {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-[rgba(212,72,88,0.30)] bg-agap-dangerSoft p-4 shadow-card">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-agap-danger text-white">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-agap-danger">{title}</p>
        {detail && (
          <p className="mt-0.5 line-clamp-2 text-sm text-agap-textMid">
            {detail}
          </p>
        )}
      </div>
      <Link
        href={href}
        className="shrink-0 self-center rounded-lg px-3 py-1.5 text-sm font-semibold text-agap-danger hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-agap-danger"
      >
        {cta}
      </Link>
    </div>
  );
}
