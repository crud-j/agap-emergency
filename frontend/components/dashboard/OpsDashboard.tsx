'use client';

import { useMemo, type JSX } from 'react';
import Link from 'next/link';
import {
  AlertCircle, Activity, Truck, Clock, Megaphone, Siren, RefreshCw,
  ArrowRight, MapPin, Zap,
} from 'lucide-react';
import {
  StatCard, PriorityBadge, StatusChip, EmptyState, Button,
} from '@/components/ui';
import { ConnectionIndicator } from '@/components/layout/ConnectionIndicator';
import { useWsState } from '@/lib/use-ws-state';
import { useAuthUser, hasRole } from '@/lib/use-auth';
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

const PRIORITY_STRIP: Record<string, string> = {
  CRITICAL: 'border-l-[3px] border-l-red-500',
  HIGH:     'border-l-[3px] border-l-orange-500',
  MEDIUM:   'border-l-[3px] border-l-amber-400',
  LOW:      'border-l-[3px] border-l-emerald-500',
};

const PRIORITY_DOT: Record<string, string> = {
  CRITICAL: 'bg-red-500',
  HIGH:     'bg-orange-500',
  MEDIUM:   'bg-amber-400',
  LOW:      'bg-emerald-500',
};

/**
 * MOD-21 — Emergency Operations and Dispatch Dashboard.
 */
export default function DashboardPage(): JSX.Element {
  const wsState = useWsState();
  const user = useAuthUser();
  const canViewOps = hasRole(user, 'DISPATCHER', 'SUPERVISOR', 'SYSTEM_ADMINISTRATOR');

  const incidentsQuery     = useIncidents({ perPage: 100 }, { enabled: canViewOps });
  const availableQuery     = useAvailableResources({ enabled: canViewOps });
  const respondersQuery    = useResponders({ perPage: 100 }, { enabled: canViewOps });
  const surgeQuery         = useSurgeState({ enabled: canViewOps });
  const announcementsQuery = usePublishedAnnouncements();

  const incidents: IncidentListItem[] = incidentsQuery.data?.data ?? [];
  const responders = respondersQuery.data ?? [];
  const available  = availableQuery.data ?? [];

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

  const failures = [
    { label: 'incidents',       q: incidentsQuery },
    { label: 'available units', q: availableQuery },
    { label: 'responders',      q: respondersQuery },
    { label: 'announcements',   q: announcementsQuery },
  ].filter((f) => f.q.isError);

  function retryAll() {
    failures.forEach((f) => void f.q.refetch());
  }

  return (
    <div className="space-y-5">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold text-agap-textMain leading-tight tracking-tight">
            Operations Dashboard
          </h1>
          <p className="mt-0.5 text-[13px] text-agap-textSub">
            Bocaue MDRRMO · live emergency operations overview
          </p>
        </div>
        <div className="flex items-center gap-2 pt-0.5">
          <ConnectionIndicator state={wsState} />
        </div>
      </div>

      {/* ── Surge / critical announcement banners ────────────────────────── */}
      {surge?.is_active && (
        <SurgeBanner
          massCasualty={surge.mass_casualty}
          reason={surge.activation_reason}
          barangays={surge.affected_barangays}
          incidentCount={surge.active_incident_count}
        />
      )}
      {criticalAnnouncement && (
        <AnnouncementBanner
          title={criticalAnnouncement.title}
          body={criticalAnnouncement.body}
        />
      )}

      {/* ── Retry strip ──────────────────────────────────────────────────── */}
      {failures.length > 0 && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-agap-danger/20 bg-agap-dangerSoft px-4 py-3">
          <div className="flex items-center gap-2 text-[13px] text-agap-danger">
            <AlertCircle size={15} className="shrink-0" />
            <span>
              Couldn&apos;t load {failures.map((f) => f.label).join(', ')}. Data shown may be incomplete.
            </span>
          </div>
          <Button variant="danger" size="sm" onClick={retryAll}>
            <RefreshCw size={13} />
            Retry
          </Button>
        </div>
      )}

      {/* ── KPI grid ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          href="/operations/incidents"
          className="rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-agap-green"
        >
          <StatCard
            label="Active Incidents"
            value={incidentsQuery.isError ? '—' : activeCount}
            icon={<AlertCircle size={17} />}
            variant="critical"
            loading={incidentsQuery.isLoading}
          />
        </Link>
        <Link
          href="/operations/fleet"
          className="rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-agap-green"
        >
          <StatCard
            label="Responders On-Scene"
            value={respondersQuery.isError ? '—' : onSceneCount}
            icon={<Activity size={17} />}
            variant="success"
            loading={respondersQuery.isLoading}
          />
        </Link>
        <Link
          href="/operations/fleet"
          className="rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-agap-green"
        >
          <StatCard
            label="Units Available"
            value={availableQuery.isError ? '—' : availableCount}
            icon={<Truck size={17} />}
            variant="success"
            loading={availableQuery.isLoading}
          />
        </Link>
        <Link
          href="/operations/dispatch"
          className="rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-agap-green"
        >
          <StatCard
            label="Pending Dispatch"
            value={incidentsQuery.isError ? '—' : pendingDispatchCount}
            icon={<Clock size={17} />}
            variant="warning"
            loading={incidentsQuery.isLoading}
          />
        </Link>
      </div>

      {/* ── Recent incidents ─────────────────────────────────────────────── */}
      <div className="rounded-xl bg-white border border-agap-track/40 shadow-card overflow-hidden">
        {/* Table header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-agap-track/30">
          <h3 className="text-[13px] font-bold text-agap-textMain">Recent Incidents</h3>
          <Link
            href="/operations/incidents"
            className="flex items-center gap-1 text-[12px] font-semibold text-agap-green hover:text-agap-green/80 transition-colors"
          >
            View all <ArrowRight size={13} />
          </Link>
        </div>

        {/* Column labels */}
        {!incidentsQuery.isLoading && !incidentsQuery.isError && recent.length > 0 && (
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 px-5 py-2 border-b border-agap-track/20">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-agap-textSub">Incident</span>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-agap-textSub">Priority</span>
            <span className="hidden sm:block text-[10px] font-semibold uppercase tracking-widest text-agap-textSub">Status</span>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-agap-textSub text-right">Time</span>
          </div>
        )}

        <div className="divide-y divide-agap-track/15">
          {incidentsQuery.isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3.5 animate-pulse">
                <div className="h-9 w-9 shrink-0 rounded-lg bg-agap-track" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-32 rounded bg-agap-track" />
                  <div className="h-2.5 w-48 rounded bg-agap-track/60" />
                </div>
                <div className="h-5 w-16 rounded-full bg-agap-track" />
              </div>
            ))
          ) : incidentsQuery.isError ? (
            <EmptyState
              icon={AlertCircle}
              title="Couldn't load incidents"
              description="The incident feed is unavailable. Check your connection and retry."
              action={
                <Button variant="secondary" size="sm" onClick={() => void incidentsQuery.refetch()}>
                  <RefreshCw size={13} />
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
      </div>
    </div>
  );
}

// ─── Incident row ────────────────────────────────────────────────────────────

function IncidentRow({ incident }: { incident: IncidentListItem }): JSX.Element {
  const Icon = categoryIcon(incident.category);
  const location =
    incident.incident_locations?.barangay ??
    incident.incident_locations?.formatted_address ??
    null;
  const strip = PRIORITY_STRIP[incident.priority] ?? 'border-l-[3px] border-l-agap-track';
  const dot   = PRIORITY_DOT[incident.priority]   ?? 'bg-agap-textSub';

  return (
    <Link
      href={`/operations/incidents?focus=${incident.id}`}
      className={`flex items-center gap-3 px-5 py-3 transition-colors hover:bg-agap-surface focus:outline-none focus-visible:bg-agap-surface ${strip}`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-agap-surface text-agap-textMid">
        <Icon size={15} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[12px] font-semibold text-agap-textMain tabular-nums">
            {incident.public_reference}
          </span>
          <span className="text-[11px] text-agap-textSub">{titleCase(incident.category)}</span>
        </div>
        <p className="truncate text-[11px] text-agap-textSub flex items-center gap-1 mt-0.5">
          {location && <MapPin size={10} className="shrink-0" />}
          {location ?? 'Location pending'}
        </p>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        <PriorityBadge priority={incident.priority} showDot={false} />
      </div>
      <StatusChip status={incident.status} className="hidden sm:inline-flex shrink-0" />
      <span className="w-14 shrink-0 text-right font-mono text-[11px] text-agap-textSub tabular-nums">
        {timeAgo(incident.submitted_at)}
      </span>
    </Link>
  );
}

// ─── Surge banner ────────────────────────────────────────────────────────────

function SurgeBanner({
  massCasualty, reason, barangays, incidentCount,
}: {
  massCasualty: boolean;
  reason?: string | null;
  barangays: string[];
  incidentCount: number;
}): JSX.Element {
  const detail = [
    reason,
    barangays.length ? `Affected: ${barangays.join(', ')}` : null,
    `${incidentCount} active incident${incidentCount === 1 ? '' : 's'}`,
  ].filter(Boolean).join(' · ');

  return (
    <div className="flex items-start gap-3 rounded-xl bg-agap-sidebar border border-white/10 px-4 py-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500/20">
        <Siren size={18} className="text-red-400" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold text-white">
          {massCasualty ? 'Mass-Casualty Surge Mode Active' : 'Disaster Surge Mode Active'}
        </p>
        {detail && <p className="mt-0.5 text-[12px] text-white/60 line-clamp-1">{detail}</p>}
      </div>
      <Link
        href="/operations/surge"
        className="flex items-center gap-1 shrink-0 self-center rounded-lg bg-white/10 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-white/15 transition-colors"
      >
        <Zap size={12} /> Open surge console
      </Link>
    </div>
  );
}

// ─── Announcement banner ─────────────────────────────────────────────────────

function AnnouncementBanner({
  title, body,
}: {
  title: string;
  body?: string | null;
}): JSX.Element {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-agap-danger/25 bg-agap-dangerSoft px-4 py-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-agap-danger/10">
        <Megaphone size={18} className="text-agap-danger" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold text-agap-danger">Critical Advisory — {title}</p>
        {body && <p className="mt-0.5 text-[12px] text-agap-textMid line-clamp-2">{body}</p>}
      </div>
      <Link
        href="/announcements"
        className="flex items-center gap-1 shrink-0 self-center rounded-lg border border-agap-danger/20 px-3 py-1.5 text-[12px] font-semibold text-agap-danger hover:bg-agap-danger/5 transition-colors"
      >
        View <ArrowRight size={12} />
      </Link>
    </div>
  );
}
