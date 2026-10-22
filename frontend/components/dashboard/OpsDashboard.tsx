'use client';

import type { JSX } from 'react';
import Link from 'next/link';
import {
  AlertCircle, AlertOctagon, CheckCircle2, Hourglass, Navigation, Truck, RefreshCw,
  ArrowRight, MapPin, Map as MapIcon, List, Radio,
} from 'lucide-react';
import {
  StatCard, PriorityBadge, StatusChip, EmptyState, Button,
} from '@/components/ui';
import { ConnectionIndicator } from '@/components/layout/ConnectionIndicator';
import { DashboardBanners } from '@/components/dashboard/DashboardBanners';
import { useWsState } from '@/lib/use-ws-state';
import { useIncidents } from '@/features/incidents/hooks';
import { useDispatchSummary } from '@/features/analytics/hooks';
import { categoryIcon, timeAgo, titleCase } from '@/lib/incident-format';
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
 * MOD-21 — Emergency Operations and Dispatch Dashboard (Dispatcher). The Supervisor
 * has its own oversight dashboard (SupervisorDashboard).
 * Other roles get their own dashboard from app/(ops)/dashboard/page.tsx.
 */
export function OpsDashboard(): JSX.Element {
  const wsState = useWsState();

  // Counts are computed in the database (GET /analytics/dispatch-summary) with the
  // same active-status list as the Incident Queue; the list below is only the newest
  // few reports for display, never the source of a count.
  const summaryQuery   = useDispatchSummary();
  const incidentsQuery = useIncidents({ perPage: RECENT_LIMIT });

  const summary = summaryQuery.data;
  const recent: IncidentListItem[] = incidentsQuery.data?.data ?? [];

  const failures = [
    { label: 'dashboard counts', q: summaryQuery },
    { label: 'recent incidents', q: incidentsQuery },
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
      <DashboardBanners showSurge />

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
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiLink href="/operations/incidents">
          <StatCard
            label="Active"
            value={summary?.active ?? '—'}
            icon={<AlertCircle size={17} />}
            trendLabel={summary && `${summary.last24h.reported} reported · ${vsPrevious(summary.last24h.reported, summary.previous24h.reported)}`}
            loading={summaryQuery.isLoading}
          />
        </KpiLink>
        <KpiLink href="/operations/triage">
          <StatCard
            label="Unreviewed"
            value={summary?.unreviewed ?? '—'}
            icon={<Hourglass size={17} />}
            variant={summary && summary.unreviewed > 0 ? 'warning' : 'default'}
            trendLabel={summary && `${summary.awaitingDispatch} awaiting dispatch`}
            loading={summaryQuery.isLoading}
          />
        </KpiLink>
        <KpiLink href="/operations/incidents">
          <StatCard
            label="Critical"
            value={summary?.critical ?? '—'}
            icon={<AlertOctagon size={17} />}
            variant={summary && summary.critical > 0 ? 'critical' : 'default'}
            trendLabel={summary && `${summary.last24h.critical} reported · ${vsPrevious(summary.last24h.critical, summary.previous24h.critical)}`}
            loading={summaryQuery.isLoading}
          />
        </KpiLink>
        <KpiLink href="/operations/dispatch">
          <StatCard
            label="En route · on scene"
            value={summary ? `${summary.enRoute} · ${summary.onScene}` : '—'}
            icon={<Navigation size={17} />}
            loading={summaryQuery.isLoading}
          />
        </KpiLink>
        <KpiLink href="/operations/history">
          <StatCard
            label="Resolved, 24 h"
            value={summary?.last24h.resolved ?? '—'}
            icon={<CheckCircle2 size={17} />}
            variant="success"
            trendLabel={summary && vsPrevious(summary.last24h.resolved, summary.previous24h.resolved)}
            loading={summaryQuery.isLoading}
          />
        </KpiLink>
        <KpiLink href="/operations/fleet">
          <StatCard
            label="Units available"
            value={summary?.units.available ?? '—'}
            icon={<Truck size={17} />}
            variant="success"
            trendLabel={summary && `${summary.units.deployed} deployed · ${summary.units.unavailable} out of service`}
            loading={summaryQuery.isLoading}
          />
        </KpiLink>
      </div>

      {/* ── Quick actions: existing screens only (no incident form, broadcast or SMS) ── */}
      <div className="flex flex-wrap gap-2">
        <QuickAction href="/operations/dispatch" icon={<Radio size={14} />}>Assign unit</QuickAction>
        <QuickAction href="/operations/incidents" icon={<List size={14} />}>View all incidents</QuickAction>
        <QuickAction href="/operations/map" icon={<MapIcon size={14} />}>Open map</QuickAction>
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

// ─── Pieces ──────────────────────────────────────────────────────────────────

/** "+2 vs previous 24 h": plain differences; percentages mislead on small counts. */
function vsPrevious(current: number, previous: number): string {
  const diff = current - previous;
  if (diff === 0) return 'same as previous 24 h';
  return `${diff > 0 ? '+' : '−'}${Math.abs(diff)} vs previous 24 h`;
}

function KpiLink({ href, children }: { href: string; children: JSX.Element }): JSX.Element {
  return (
    <Link href={href} className="rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-agap-green">
      {children}
    </Link>
  );
}

function QuickAction({ href, icon, children }: { href: string; icon: JSX.Element; children: string }): JSX.Element {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-lg border border-agap-track/60 bg-white px-3.5 py-2 text-sm font-semibold text-agap-textMain shadow-card hover:bg-agap-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-agap-green/40"
    >
      {icon} {children}
    </Link>
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

