'use client';

import { useEffect, useMemo, useRef, useState, type JSX, type ReactNode } from 'react';
import Link from 'next/link';
import {
  AlertCircle, AlertOctagon, CheckCircle2, ChevronRight, Hourglass, Navigation, Truck, RefreshCw,
  ArrowRight, MapPin, Map as MapIcon, List, Radio, Activity,
} from 'lucide-react';
import {
  StatCard, PriorityBadge, StatusChip, EmptyState, Button,
} from '@/components/ui';
import { ConnectionIndicator } from '@/components/layout/ConnectionIndicator';
import { DashboardBanners } from '@/components/dashboard/DashboardBanners';
import { useWsState } from '@/lib/use-ws-state';
import { useNow } from '@/lib/use-now';
import { useIncidents } from '@/features/incidents/hooks';
import { useDispatchSummary } from '@/features/analytics/hooks';
import { categoryIcon, timeAgo, titleCase } from '@/lib/incident-format';
import type { IncidentListItem } from '@/features/incidents/api';
import { arrivedIds } from '@/features/incidents/live-patch';

const RECENT_LIMIT = 8;
// Socket events keep the page current; while the socket is down, poll instead.
const OFFLINE_POLL_MS = 15_000;
// How long a changed count or a newly arrived report stays highlighted.
const HIGHLIGHT_MS = 4_000;

const PRIORITY_STRIP: Record<string, string> = {
  CRITICAL: 'border-l-[3px] border-l-red-500',
  HIGH:     'border-l-[3px] border-l-orange-500',
  MEDIUM:   'border-l-[3px] border-l-amber-400',
  LOW:      'border-l-[3px] border-l-emerald-500',
};

/** Recent-incidents columns; the header row and every incident row share it so they line up. */
const ROW_GRID =
  'grid grid-cols-[minmax(0,1fr)_auto_3.5rem] items-center gap-x-3 sm:grid-cols-[minmax(0,1fr)_6.5rem_8.5rem_4rem] sm:gap-x-4';

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-agap-green/60';

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
  const live = wsState === 'connected';
  const summaryQuery   = useDispatchSummary(live ? undefined : { refetchInterval: OFFLINE_POLL_MS });
  const incidentsQuery = useIncidents(
    { perPage: RECENT_LIMIT },
    { refetchInterval: live ? false : OFFLINE_POLL_MS },
  );

  const summary = summaryQuery.data;
  const recent = useMemo<IncidentListItem[]>(() => incidentsQuery.data?.data ?? [], [incidentsQuery.data]);
  const arrived = useArrivals(recent, incidentsQuery.isSuccess);

  const failures = [
    { label: 'dashboard counts', q: summaryQuery },
    { label: 'recent incidents', q: incidentsQuery },
  ].filter((f) => f.q.isError);

  function retryAll() {
    failures.forEach((f) => void f.q.refetch());
  }

  const loading = summaryQuery.isLoading;

  return (
    <div className="space-y-5">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold text-agap-textMain leading-tight tracking-tight">
            Operations Dashboard
          </h1>
          <p className="mt-0.5 text-[13px] text-slate-500">
            Bocaue MDRRMO · live emergency operations overview
          </p>
        </div>
        <div className="flex items-center gap-3 pt-0.5">
          <UpdatedAgo
            at={Math.max(summaryQuery.dataUpdatedAt, incidentsQuery.dataUpdatedAt)}
            fetching={summaryQuery.isFetching || incidentsQuery.isFetching}
          />
          <ConnectionIndicator state={wsState} />
        </div>
      </div>

      {/* ── Surge / critical announcement banners ────────────────────────── */}
      <DashboardBanners showSurge />

      {/* ── Retry strip ──────────────────────────────────────────────────── */}
      {failures.length > 0 && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-agap-danger/20 bg-agap-dangerSoft px-4 py-3"
        >
          <div className="flex items-center gap-2 text-[13px] text-agap-danger">
            <AlertCircle size={15} aria-hidden="true" className="shrink-0" />
            <span>
              Couldn&apos;t load {failures.map((f) => f.label).join(', ')}. Data shown may be incomplete.
            </span>
          </div>
          <Button variant="danger" size="sm" onClick={retryAll}>
            <RefreshCw size={13} aria-hidden="true" />
            Retry
          </Button>
        </div>
      )}

      {/* ── KPI grid — most urgent first ─────────────────────────────────── */}
      <section aria-label="Live counts" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiLink href="/operations/incidents" label="Critical incidents" value={summary?.critical} destination="incident queue">
          <StatCard
            label="Critical"
            value={summary?.critical ?? '—'}
            icon={<AlertOctagon size={17} aria-hidden="true" />}
            variant={summary && summary.critical > 0 ? 'critical' : 'default'}
            trendLabel={summary && `${summary.last24h.critical} reported · ${vsPrevious(summary.last24h.critical, summary.previous24h.critical)}`}
            loading={loading}
          />
        </KpiLink>
        <KpiLink href="/operations/triage" label="Unreviewed incidents" value={summary?.unreviewed} destination="triage">
          <StatCard
            label="Unreviewed"
            value={summary?.unreviewed ?? '—'}
            icon={<Hourglass size={17} aria-hidden="true" />}
            variant={summary && summary.unreviewed > 0 ? 'warning' : 'default'}
            trendLabel={summary && `${summary.awaitingDispatch} awaiting dispatch`}
            loading={loading}
          />
        </KpiLink>
        <KpiLink href="/operations/incidents" label="Active incidents" value={summary?.active} destination="incident queue">
          <StatCard
            label="Active"
            value={summary?.active ?? '—'}
            icon={<AlertCircle size={17} aria-hidden="true" />}
            trendLabel={summary && `${summary.last24h.reported} reported · ${vsPrevious(summary.last24h.reported, summary.previous24h.reported)}`}
            loading={loading}
          />
        </KpiLink>
        <KpiLink
          href="/operations/dispatch"
          label="Units in the field"
          value={summary ? summary.enRoute + summary.onScene : undefined}
          destination="dispatch"
        >
          <StatCard
            label="In the field"
            value={summary ? summary.enRoute + summary.onScene : '—'}
            icon={<Navigation size={17} aria-hidden="true" />}
            trendLabel={summary && `${summary.enRoute} en route · ${summary.onScene} on scene`}
            loading={loading}
          />
        </KpiLink>
        <KpiLink href="/operations/fleet" label="Units available" value={summary?.units.available} destination="fleet">
          <StatCard
            label="Units available"
            value={summary?.units.available ?? '—'}
            icon={<Truck size={17} aria-hidden="true" />}
            variant="success"
            trendLabel={summary && `${summary.units.deployed} deployed · ${summary.units.unavailable} out of service`}
            loading={loading}
          />
        </KpiLink>
        <KpiLink href="/operations/history" label="Resolved in the last 24 hours" value={summary?.last24h.resolved} destination="history">
          <StatCard
            label="Resolved, 24 h"
            value={summary?.last24h.resolved ?? '—'}
            icon={<CheckCircle2 size={17} aria-hidden="true" />}
            variant="success"
            trendLabel={summary && vsPrevious(summary.last24h.resolved, summary.previous24h.resolved)}
            loading={loading}
          />
        </KpiLink>
      </section>

      {/* ── Work area: next actions beside the newest reports ─────────────── */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">

        {/* Next actions — first in reading order; moves to the right column on wide screens. */}
        <section
          aria-labelledby="ops-next-actions"
          className="h-fit rounded-xl border border-agap-track/40 bg-white shadow-card xl:order-2"
        >
          <div className="border-b border-agap-track/30 px-5 py-3.5">
            <h2 id="ops-next-actions" className="text-[13px] font-bold text-agap-textMain">Next actions</h2>
          </div>
          {/* Existing screens only (no incident form, broadcast or SMS). */}
          <ul className="divide-y divide-agap-track/20 p-1.5">
            <ActionRow
              href="/operations/triage"
              icon={<Hourglass size={16} aria-hidden="true" />}
              title="Review new reports"
              detail={countDetail(summary?.unreviewed, 'waiting for review', 'Nothing to review')}
              tone={summary && summary.unreviewed > 0 ? 'warning' : 'neutral'}
              loading={loading}
            />
            <ActionRow
              href="/operations/dispatch"
              icon={<Radio size={16} aria-hidden="true" />}
              title="Assign units"
              detail={countDetail(summary?.awaitingDispatch, 'awaiting dispatch', 'No incidents awaiting dispatch')}
              tone={summary && summary.awaitingDispatch > 0 ? 'primary' : 'neutral'}
              loading={loading}
            />
            <ActionRow
              href="/operations/map"
              icon={<MapIcon size={16} aria-hidden="true" />}
              title="Open live map"
              detail="Incidents, units and routes"
            />
            <ActionRow
              href="/operations/incidents"
              icon={<List size={16} aria-hidden="true" />}
              title="View all incidents"
              detail="Full incident queue with filters"
            />
          </ul>
        </section>

        {/* Recent incidents */}
        <section
          aria-labelledby="ops-recent"
          className="min-w-0 overflow-hidden rounded-xl border border-agap-track/40 bg-white shadow-card xl:order-1"
        >
          <div className="flex items-center justify-between gap-3 border-b border-agap-track/30 px-4 py-3.5 sm:px-5">
            <div className="flex items-center gap-2">
              <Activity size={15} aria-hidden="true" className="text-agap-green" />
              <h2 id="ops-recent" className="text-[13px] font-bold text-agap-textMain">Recent incidents</h2>
              {recent.length > 0 && (
                <span className="text-xs text-slate-500">· newest {recent.length}</span>
              )}
            </div>
            <Link
              href="/operations/incidents"
              className={`-mr-2 inline-flex h-9 items-center gap-1 rounded-lg px-2 text-[13px] font-semibold text-agap-green transition-colors hover:bg-agap-greenSoft ${FOCUS_RING}`}
            >
              View all <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>

          {/* Column labels — same grid as the rows */}
          {!incidentsQuery.isLoading && !incidentsQuery.isError && recent.length > 0 && (
            <div
              aria-hidden="true"
              className={`${ROW_GRID} border-b border-agap-track/20 bg-agap-surface/40 py-2 pl-[calc(1rem+3px)] pr-4 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 sm:pl-[calc(1.25rem+3px)] sm:pr-5`}
            >
              <span>Incident</span>
              <span>Priority</span>
              <span className="hidden sm:block">Status</span>
              <span className="text-right">Reported</span>
            </div>
          )}

          {incidentsQuery.isLoading ? (
            <div aria-busy="true" aria-label="Loading recent incidents" className="divide-y divide-agap-track/15">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3.5 animate-pulse motion-reduce:animate-none">
                  <div className="h-9 w-9 shrink-0 rounded-lg bg-agap-track" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-32 rounded bg-agap-track" />
                    <div className="h-2.5 w-48 rounded bg-agap-track/60" />
                  </div>
                  <div className="h-5 w-16 rounded-full bg-agap-track" />
                </div>
              ))}
            </div>
          ) : incidentsQuery.isError ? (
            <EmptyState
              icon={AlertCircle}
              title="Couldn't load incidents"
              description="The incident feed is unavailable. Check your connection and retry."
              action={
                <Button variant="secondary" size="sm" onClick={() => void incidentsQuery.refetch()}>
                  <RefreshCw size={13} aria-hidden="true" />
                  Retry
                </Button>
              }
            />
          ) : recent.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="No incidents yet"
              description="All clear — no emergency incidents have been reported in Bocaue."
            />
          ) : (
            <ul className="divide-y divide-agap-track/15">
              {recent.map((inc) => (
                <li key={inc.id}>
                  <IncidentRow incident={inc} arrived={arrived.has(inc.id)} />
                </li>
              ))}
            </ul>
          )}
        </section>
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

function countDetail(count: number | undefined, label: string, none: string): string | undefined {
  if (count === undefined) return undefined;
  return count === 0 ? none : `${count} ${label}`;
}

/** True for a few seconds after `value` changes (not on the first load), to draw the eye. */
function useChangePulse(value: number | undefined): boolean {
  const previous = useRef(value);
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    const before = previous.current;
    previous.current = value;
    if (before === undefined || value === undefined || before === value) return;
    setPulse(true);
    const timer = setTimeout(() => setPulse(false), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [value]);
  return pulse;
}

/**
 * Reports that appeared in the list since the last load, for a few seconds. The first
 * load highlights nothing. The timer lives in a ref, so a status patch to the list
 * while a row is highlighted doesn't cancel its fade.
 */
function useArrivals(list: IncidentListItem[], loaded: boolean): ReadonlySet<string> {
  const seen = useRef<Set<string> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [arrived, setArrived] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    if (!loaded) return;
    const ids = arrivedIds(seen.current, list);
    seen.current = new Set(list.map((item) => item.id));
    if (ids.length === 0) return;
    setArrived(new Set(ids));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setArrived(new Set()), HIGHLIGHT_MS);
  }, [list, loaded]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return arrived;
}

/** How fresh the counts are — the dashboard must never look live when it is not. */
function UpdatedAgo({ at, fetching }: { at: number; fetching: boolean }): JSX.Element | null {
  const now = useNow(1_000);
  if (!at) return null;
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  const text = seconds < 15 ? 'just now' : seconds < 60 ? `${seconds}s ago` : `${Math.round(seconds / 60)} min ago`;
  return (
    <span className="hidden items-center gap-1.5 text-xs text-slate-500 sm:inline-flex">
      <RefreshCw
        size={12}
        aria-hidden="true"
        className={fetching ? 'animate-spin motion-reduce:animate-none' : ''}
      />
      Updated {text}
    </span>
  );
}

/** A KPI card that opens its screen; the accessible name says what it counts and where it goes. */
function KpiLink({
  href, label, value, destination, children,
}: {
  href: string;
  label: string;
  value: number | undefined;
  destination: string;
  children: JSX.Element;
}): JSX.Element {
  // A count that just changed gets a green ring for a few seconds (no motion).
  const changed = useChangePulse(value);
  return (
    <Link
      href={href}
      aria-label={`${label}: ${value ?? 'loading'}. Open ${destination}.`}
      className={`group rounded-xl transition-transform active:scale-[0.99] motion-reduce:transform-none [&>div]:h-full [&>div]:transition-shadow [&>div]:duration-500 [&:hover>div]:border-agap-green/30 ${
        changed ? '[&>div]:ring-2 [&>div]:ring-agap-green/50' : ''
      } ${FOCUS_RING} focus-visible:ring-offset-2`}
    >
      {children}
    </Link>
  );
}

function ActionRow({
  href, icon, title, detail, tone = 'neutral', loading,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  detail?: string | undefined;
  tone?: 'primary' | 'warning' | 'neutral';
  loading?: boolean;
}): JSX.Element {
  const tile =
    tone === 'primary' ? 'bg-agap-green text-white'
    : tone === 'warning' ? 'bg-agap-amberSoft text-agap-amber'
    : 'bg-agap-surface text-agap-textMid';
  return (
    <li>
      <Link
        href={href}
        className={`group flex min-h-14 items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-agap-surface/70 ${FOCUS_RING}`}
      >
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tile}`}>{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-agap-textMain">{title}</span>
          {loading ? (
            <span className="mt-1 block h-2.5 w-28 animate-pulse rounded bg-agap-track/70 motion-reduce:animate-none" />
          ) : detail ? (
            <span
              className={`block truncate text-xs ${
                tone === 'warning' ? 'font-medium text-agap-amber' : tone === 'primary' ? 'font-medium text-agap-green' : 'text-slate-500'
              }`}
            >
              {detail}
            </span>
          ) : null}
        </span>
        <ChevronRight
          size={16}
          aria-hidden="true"
          className="shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-agap-textMid motion-reduce:transform-none"
        />
      </Link>
    </li>
  );
}

// ─── Incident row ────────────────────────────────────────────────────────────

/** "5m ago" that keeps counting while the list itself hasn't changed. */
function ReportedAgo({ iso }: { iso: string }): JSX.Element {
  useNow(30_000);
  return <>{timeAgo(iso)}</>;
}

function IncidentRow({ incident, arrived }: { incident: IncidentListItem; arrived: boolean }): JSX.Element {
  const Icon = categoryIcon(incident.category);
  const location =
    incident.incident_locations?.barangay ??
    incident.incident_locations?.formatted_address ??
    null;
  const strip = PRIORITY_STRIP[incident.priority] ?? 'border-l-[3px] border-l-agap-track';

  return (
    <Link
      href={`/operations/incidents?focus=${incident.id}`}
      className={`${ROW_GRID} min-h-14 px-4 py-3 transition-colors duration-700 motion-reduce:transition-none hover:bg-agap-surface/60 sm:px-5 focus-visible:bg-agap-surface/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-agap-green/60 ${strip} ${
        arrived ? 'bg-agap-greenSoft/70' : ''
      }`}
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-agap-surface text-agap-textMid">
          <Icon size={16} aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="flex min-w-0 items-baseline gap-1.5">
            <span className="font-mono text-[12px] font-semibold text-agap-textMain tabular-nums">
              {incident.public_reference}
            </span>
            <span className="truncate text-xs text-agap-textMid">{titleCase(incident.category)}</span>
            {arrived && (
              <span className="shrink-0 rounded-full bg-agap-green px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-white">
                New
              </span>
            )}
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-slate-500">
            <MapPin size={11} aria-hidden="true" className="shrink-0" />
            <span className={`truncate ${location ? '' : 'italic'}`}>{location ?? 'Location pending'}</span>
          </span>
        </span>
      </span>

      <span>
        <PriorityBadge priority={incident.priority} />
      </span>
      <span className="hidden sm:block">
        <StatusChip status={incident.status} />
      </span>
      <span className="text-right font-mono text-[11px] text-slate-500 tabular-nums">
        <ReportedAgo iso={incident.submitted_at} />
      </span>
    </Link>
  );
}
