'use client';

import { useMemo, useState, type JSX } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  Activity, AlarmClock, AlertOctagon, ArrowRight, ArrowRightLeft, CheckCircle2, Clock,
  Hourglass, MapPinOff, Navigation, ShieldCheck, Truck, UserX, Users, Ban,
} from 'lucide-react';
import { SLA_ACKNOWLEDGEMENT_MINUTES, SLA_DISPATCH_MINUTES } from '@agap/shared';
import { Badge, Skeleton, StatCard, StatusChip, PriorityBadge } from '@/components/ui';
import { ConnectionIndicator } from '@/components/layout/ConnectionIndicator';
import { DashboardBanners } from '@/components/dashboard/DashboardBanners';
import { DashboardPanel } from '@/components/dashboard/DashboardPanel';
import { IncidentDetailDrawer } from '@/components/incidents/IncidentDetailDrawer';
import type { MapIncident } from '@/components/incidents/IncidentMapView';
import {
  useActivity, useExceptions, useOversightSummary, usePendingHandovers, useWorkload,
} from '@/features/oversight/hooks';
import { useEscalations } from '@/features/escalations/hooks';
import { usePendingApprovals } from '@/features/announcements/hooks';
import { useIncidentLocations, useLiveResponders } from '@/features/map/hooks';
import { ACTIVE_STATUSES, formatDurationSec, timeAgo, titleCase } from '@/lib/incident-format';
import { useWsState } from '@/lib/use-ws-state';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';

// MapLibre needs the browser (WebGL + workers).
const IncidentMapView = dynamic(
  () => import('@/components/incidents/IncidentMapView').then((m) => m.IncidentMapView),
  { ssr: false, loading: () => <Skeleton className="h-full w-full" /> },
);

/** Shared rule 5: say so when the counts stop refreshing. */
const STALE_AFTER_MS = 3 * 60_000;
const ESCALATION_PREVIEW = 5;
const ACTIVITY_SHOWN = 12;

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' });
}

function Empty({ children }: { children: string }): JSX.Element {
  return <p className="py-1 text-sm text-agap-textSub">{children}</p>;
}

function LoadError({ what }: { what: string }): JSX.Element {
  return <p className="py-1 text-sm text-agap-danger">Couldn&apos;t load {what}.</p>;
}

/** Average against its SLA target, with an icon and words (never colour alone). */
function SlaRow({ label, sec, targetMin }: { label: string; sec: number | null; targetMin?: number }): JSX.Element {
  const met = sec !== null && targetMin !== undefined ? sec <= targetMin * 60 : null;
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[13px] text-agap-textMid">
        {label}
        {targetMin !== undefined && <span className="ml-1 text-[11px] text-agap-textSub">target {targetMin} min</span>}
      </dt>
      <dd className="flex items-center gap-1.5">
        <span className="font-mono text-[15px] font-semibold tabular-nums text-agap-textMain">{formatDurationSec(sec)}</span>
        {met === true && <Badge variant="green"><CheckCircle2 size={11} /> Within</Badge>}
        {met === false && <Badge variant="red"><AlarmClock size={11} /> Over</Badge>}
      </dd>
    </div>
  );
}

/**
 * Supervisor dashboard (spec §4): operations summary, escalation queue, dispatcher
 * workload, exceptions, handovers awaiting acknowledgement, performance, resource
 * coverage, a compact live map and recent incident activity. Every figure comes from
 * stored rows via /oversight/* and the existing escalation and map endpoints.
 */
export function SupervisorDashboard(): JSX.Element {
  const wsState = useWsState();
  const now = useNow(15_000);
  const [drawerId, setDrawerId] = useState<string | null>(null);

  const summaryQ = useOversightSummary();
  const exceptionsQ = useExceptions();
  const workloadQ = useWorkload();
  const handoversQ = usePendingHandovers();
  const activityQ = useActivity();
  const escalationsQ = useEscalations();
  const approvalsQ = usePendingApprovals();
  const { data: incidentLocations } = useIncidentLocations();
  const { data: responders } = useLiveResponders();

  const summary = summaryQ.data;
  const pendingApprovals = approvalsQ.data?.length ?? 0;
  const stale = !!summary && now - summaryQ.dataUpdatedAt > STALE_AFTER_MS;

  const openEscalations = useMemo(
    () => (escalationsQ.data ?? []).filter((e) => e.status === 'ACTIVE' || e.status === 'ACKNOWLEDGED'),
    [escalationsQ.data],
  );
  const mapIncidents = useMemo<MapIncident[]>(
    () => (incidentLocations ?? []).filter((i) => ACTIVE_STATUSES.includes(i.status)),
    [incidentLocations],
  );

  const exceptions = exceptionsQ.data;
  const exceptionCount = exceptions
    ? exceptions.waiting.length + exceptions.rejected.filter((r) => !r.reassigned).length + exceptions.staleLocation.length
    : 0;

  const open = (incidentId: string) => setDrawerId(incidentId);
  const rowButton = 'flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-agap-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-agap-green/40';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold leading-tight tracking-tight text-agap-textMain">Operations Oversight</h1>
          <p className="mt-0.5 text-[13px] text-agap-textSub">
            Dispatch activity, exceptions and handovers across Bocaue
            {summary && <> · Last updated {fmtTime(summaryQ.dataUpdatedAt)}</>}
          </p>
        </div>
        <ConnectionIndicator state={wsState} />
      </div>

      <DashboardBanners />

      {pendingApprovals > 0 && (
        <Link
          href="/operations/approvals"
          className="flex items-center gap-3 rounded-xl border border-[rgba(37,99,235,0.25)] bg-agap-infoSoft px-4 py-3 text-sm text-agap-textMain hover:bg-agap-infoSoft/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-agap-green/40"
        >
          <ShieldCheck size={17} className="shrink-0 text-agap-info" aria-hidden />
          <span className="flex-1">
            <span className="font-semibold">
              {pendingApprovals} CRITICAL {pendingApprovals === 1 ? 'advisory awaits' : 'advisories await'} your approval.
            </span>{' '}
            Nothing reaches residents until a Supervisor approves it.
          </span>
          <span className="flex items-center gap-1 text-[12px] font-semibold text-agap-info">Review <ArrowRight size={13} /></span>
        </Link>
      )}

      {(stale || (summaryQ.isError && !summary)) && (
        <div role="status" className="rounded-xl border border-[rgba(217,119,6,0.25)] bg-agap-amberSoft px-4 py-2.5 text-sm text-agap-textMid">
          {summary
            ? `These figures have not refreshed since ${fmtTime(summaryQ.dataUpdatedAt)}. They may be out of date.`
            : 'Couldn’t load the operations summary. Retrying every minute.'}
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Active" value={summary?.active ?? '—'} icon={<Activity size={17} />} loading={summaryQ.isLoading} />
        <StatCard
          label="Immediate"
          value={summary?.critical ?? '—'}
          icon={<AlertOctagon size={17} />}
          variant={summary && summary.critical > 0 ? 'critical' : 'default'}
          loading={summaryQ.isLoading}
        />
        <StatCard
          label="Not acknowledged"
          value={summary?.unacknowledged ?? '—'}
          icon={<Hourglass size={17} />}
          variant={summary && summary.unacknowledged > 0 ? 'warning' : 'default'}
          loading={summaryQ.isLoading}
        />
        <StatCard
          label="Open escalations"
          value={summary?.openEscalations ?? '—'}
          icon={<AlarmClock size={17} />}
          variant={summary && summary.openEscalations > 0 ? 'warning' : 'default'}
          loading={summaryQ.isLoading}
        />
        <StatCard
          label="En route · on scene"
          value={summary ? `${summary.enRoute} · ${summary.onScene}` : '—'}
          icon={<Navigation size={17} />}
          loading={summaryQ.isLoading}
        />
        <StatCard
          label="Resolved today"
          value={summary?.resolvedToday ?? '—'}
          icon={<CheckCircle2 size={17} />}
          variant="success"
          loading={summaryQ.isLoading}
        />
      </div>

      {/* Exceptions + escalations */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[3fr_2fr]">
        <DashboardPanel
          title={<>Incident exceptions {exceptions && <Badge variant={exceptionCount > 0 ? 'red' : 'muted'}>{exceptionCount}</Badge>}</>}
          bodyClassName="space-y-4"
        >
          {exceptionsQ.isError ? <LoadError what="exceptions" /> : !exceptions ? <Skeleton className="h-40 w-full" /> : (
            <>
              <div>
                <h3 className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-agap-textSub">
                  <Hourglass size={13} /> Waiting over {exceptions.thresholds.waitingMinutes} min for acknowledgement
                </h3>
                {exceptions.waiting.length === 0 ? <Empty>None.</Empty> : (
                  <ul>
                    {exceptions.waiting.map((w) => (
                      <li key={w.incidentId}>
                        <button type="button" className={rowButton} onClick={() => open(w.incidentId)}>
                          <span className="font-mono text-[12px] font-semibold text-agap-textMain">{w.publicReference}</span>
                          <PriorityBadge priority={w.priority} />
                          <span className="truncate text-[12px] text-agap-textSub">{titleCase(w.category)}</span>
                          <span className="ml-auto whitespace-nowrap font-mono text-[12px] tabular-nums text-agap-danger">
                            {formatDurationSec(w.waitingSec)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-agap-textSub">
                  <Ban size={13} /> Rejected dispatches on active incidents
                </h3>
                {exceptions.rejected.length === 0 ? <Empty>None.</Empty> : (
                  <ul>
                    {exceptions.rejected.map((r) => (
                      <li key={r.dispatchId}>
                        <button type="button" className={rowButton} onClick={() => open(r.incidentId)}>
                          <span className="font-mono text-[12px] font-semibold text-agap-textMain">{r.publicReference}</span>
                          <span className="text-[12px] text-agap-textMid">{r.unit}</span>
                          <span className="truncate text-[12px] text-agap-textSub">{r.reason ?? 'No reason given'}</span>
                          <span className="ml-auto">
                            {r.reassigned
                              ? <Badge variant="green"><CheckCircle2 size={11} /> Re-dispatched</Badge>
                              : <Badge variant="red"><UserX size={11} /> Needs a unit</Badge>}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-agap-textSub">
                  <MapPinOff size={13} /> No unit location for over {exceptions.thresholds.staleLocationMinutes} min
                </h3>
                {exceptions.staleLocation.length === 0 ? <Empty>None.</Empty> : (
                  <ul>
                    {exceptions.staleLocation.map((s) => (
                      <li key={s.dispatchId}>
                        <button type="button" className={rowButton} onClick={() => open(s.incidentId)}>
                          <span className="font-mono text-[12px] font-semibold text-agap-textMain">{s.publicReference}</span>
                          <span className="text-[12px] text-agap-textMid">{s.unit}</span>
                          <span className="ml-auto whitespace-nowrap text-[12px] text-agap-textSub">
                            {s.lastSeenAt ? `Last seen ${timeAgo(s.lastSeenAt)}` : 'Never shared a location'}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </DashboardPanel>

        <DashboardPanel
          title="Escalation queue"
          action={(
            <Link href="/operations/escalations" className="flex items-center gap-1 text-[12px] font-semibold text-agap-green hover:text-agap-green/80">
              Open <ArrowRight size={13} />
            </Link>
          )}
        >
          {escalationsQ.isError ? <LoadError what="escalations" /> : escalationsQ.isLoading ? <Skeleton className="h-32 w-full" /> :
            openEscalations.length === 0 ? <Empty>No open escalations.</Empty> : (
              <ul className="-mx-2">
                {openEscalations.slice(0, ESCALATION_PREVIEW).map((e) => (
                  <li key={e.id}>
                    <button type="button" className={rowButton} onClick={() => open(e.incident_id)}>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2">
                          <span className="font-mono text-[12px] font-semibold text-agap-textMain">{e.incidents?.public_reference ?? '—'}</span>
                          <Badge variant={e.status === 'ACTIVE' ? 'red' : 'amber'}>{titleCase(e.status)}</Badge>
                        </p>
                        <p className="truncate text-[11px] text-agap-textSub">{e.triggered_reason}</p>
                      </div>
                      <span className="whitespace-nowrap text-[11px] text-agap-textSub">{timeAgo(e.created_at)}</span>
                    </button>
                  </li>
                ))}
                {openEscalations.length > ESCALATION_PREVIEW && (
                  <li className="px-2 pt-1 text-[11px] text-agap-textSub">+{openEscalations.length - ESCALATION_PREVIEW} more</li>
                )}
              </ul>
            )}
        </DashboardPanel>
      </div>

      {/* Workload + handovers */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <DashboardPanel title={<><Users size={14} className="text-agap-textSub" /> Dispatcher workload</>}>
          {workloadQ.isError ? <LoadError what="workload" /> : !workloadQ.data ? <Skeleton className="h-32 w-full" /> :
            workloadQ.data.length === 0 ? <Empty>No active dispatchers or supervisors.</Empty> : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-agap-textSub">
                    <th className="pb-2 font-semibold">Name</th>
                    <th className="pb-2 text-right font-semibold">Open dispatches</th>
                    <th className="pb-2 text-right font-semibold">Incidents</th>
                    <th className="pb-2 text-right font-semibold">Actions, last hour</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-agap-track/15">
                  {workloadQ.data.map((w) => (
                    <tr key={w.userId}>
                      <td className="py-2">
                        <span className="font-semibold text-agap-textMain">{w.name}</span>{' '}
                        <span className="text-[11px] text-agap-textSub">{titleCase(w.role)}</span>
                      </td>
                      <td className="py-2 text-right font-mono tabular-nums">{w.openDispatches}</td>
                      <td className="py-2 text-right font-mono tabular-nums">{w.openIncidents}</td>
                      <td className="py-2 text-right font-mono tabular-nums">{w.actionsLastHour}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </DashboardPanel>

        <DashboardPanel title={<><ArrowRightLeft size={14} className="text-agap-textSub" /> Handovers awaiting acknowledgement</>}>
          {handoversQ.isError ? <LoadError what="handovers" /> : !handoversQ.data ? <Skeleton className="h-32 w-full" /> :
            handoversQ.data.length === 0 ? <Empty>Every handover has been acknowledged.</Empty> : (
              <ul className="-mx-2">
                {handoversQ.data.map((h) => (
                  <li key={h.id}>
                    <button type="button" className={rowButton} onClick={() => open(h.incidentId)}>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2">
                          <span className="font-mono text-[12px] font-semibold text-agap-textMain">{h.publicReference}</span>
                          <StatusChip status={h.incidentStatus} />
                        </p>
                        <p className="truncate text-[12px] text-agap-textMid">
                          {h.from.name} <ArrowRight size={11} className="inline" aria-label="to" /> {h.to.name}
                          {h.pendingActionCount > 0 && <span className="text-agap-textSub"> · {h.pendingActionCount} pending action{h.pendingActionCount === 1 ? '' : 's'}</span>}
                        </p>
                      </div>
                      <span className="whitespace-nowrap text-[11px] text-agap-textSub">{timeAgo(h.handedOverAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
        </DashboardPanel>
      </div>

      {/* Performance + coverage + map */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr_2fr]">
        <DashboardPanel title={<><Clock size={14} className="text-agap-textSub" /> Performance, last 7 days</>}>
          {!summary ? <Skeleton className="h-32 w-full" /> : (
            <dl className="space-y-3">
              <SlaRow label="Report to acknowledgement" sec={summary.performance7d.acknowledgeSec} targetMin={SLA_ACKNOWLEDGEMENT_MINUTES} />
              <SlaRow label="Report to dispatch" sec={summary.performance7d.dispatchSec} targetMin={SLA_DISPATCH_MINUTES} />
              <SlaRow label="Dispatch to arrival" sec={summary.performance7d.arrivalSec} />
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[13px] text-agap-textMid">Resolved or closed</dt>
                <dd className="font-mono text-[15px] font-semibold tabular-nums text-agap-textMain">
                  {summary.performance7d.resolvedShare === null ? '—' : `${Math.round(summary.performance7d.resolvedShare * 100)}%`}
                </dd>
              </div>
              <p className="text-[11px] text-agap-textSub">Averages over incidents reported in the last 7 days.</p>
            </dl>
          )}
        </DashboardPanel>

        <DashboardPanel
          title={<><Truck size={14} className="text-agap-textSub" /> Resource coverage</>}
          action={(
            <Link href="/operations/fleet" className="flex items-center gap-1 text-[12px] font-semibold text-agap-green hover:text-agap-green/80">
              Fleet <ArrowRight size={13} />
            </Link>
          )}
        >
          {!summary ? <Skeleton className="h-32 w-full" /> : (
            <dl className="space-y-3">
              {([
                ['Available', summary.units.available, 'bg-agap-green'],
                ['Deployed', summary.units.deployed, 'bg-agap-amber'],
                ['Out of service', summary.units.unavailable, 'bg-agap-track'],
              ] as const).map(([label, count, bar]) => {
                const total = summary.units.available + summary.units.deployed + summary.units.unavailable;
                return (
                  <div key={label}>
                    <div className="flex items-baseline justify-between">
                      <dt className="text-[13px] text-agap-textMid">{label}</dt>
                      <dd className="font-mono text-[15px] font-semibold tabular-nums text-agap-textMain">{count}</dd>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-agap-surface" aria-hidden>
                      <div className={cn('h-1.5 rounded-full', bar)} style={{ width: total ? `${(count / total) * 100}%` : '0%' }} />
                    </div>
                  </div>
                );
              })}
            </dl>
          )}
        </DashboardPanel>

        <DashboardPanel
          title="Live map"
          bodyClassName="p-0"
          action={(
            <Link href="/operations/map" className="flex items-center gap-1 text-[12px] font-semibold text-agap-green hover:text-agap-green/80">
              Full map <ArrowRight size={13} />
            </Link>
          )}
        >
          <div className="relative h-72 overflow-hidden rounded-b-xl">
            <IncidentMapView incidents={mapIncidents} responders={responders ?? []} selectedId={drawerId} onSelect={open} />
          </div>
        </DashboardPanel>
      </div>

      {/* Activity */}
      <DashboardPanel title="Recent incident activity">
        {activityQ.isError ? <LoadError what="activity" /> : !activityQ.data ? <Skeleton className="h-32 w-full" /> :
          activityQ.data.length === 0 ? <Empty>No incident activity yet.</Empty> : (
            <ul className="-mx-2 grid grid-cols-1 lg:grid-cols-2 lg:gap-x-4">
              {activityQ.data.slice(0, ACTIVITY_SHOWN).map((a) => (
                <li key={a.id}>
                  <button type="button" className={rowButton} onClick={() => open(a.incidentId)}>
                    <span className="font-mono text-[12px] font-semibold text-agap-textMain">{a.publicReference}</span>
                    <span className="truncate text-[12px] text-agap-textMid">
                      {a.fromStatus && a.fromStatus !== a.toStatus
                        ? <>{titleCase(a.fromStatus)} <ArrowRight size={11} className="inline" aria-label="to" /> {titleCase(a.toStatus)}</>
                        : `Updated (${titleCase(a.toStatus)})`}
                      <span className="text-agap-textSub"> · {a.actor ? a.actor.name : 'System'}</span>
                    </span>
                    <span className="ml-auto whitespace-nowrap text-[11px] text-agap-textSub">{timeAgo(a.occurredAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
      </DashboardPanel>

      <IncidentDetailDrawer incidentId={drawerId} open={!!drawerId} onOpenChange={(o) => { if (!o) setDrawerId(null); }} />
    </div>
  );
}
