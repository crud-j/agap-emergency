'use client';

import type { JSX } from 'react';
import {
  CheckCircle2, XCircle, AlertTriangle, Database, Cpu, Layers,
  MessageSquare, BellRing, Map as MapIcon,
} from 'lucide-react';
import { Badge, Skeleton, EmptyState } from '@/components/ui';
import { useSystemHealth } from '@/features/admin/hooks';
import type { QueueHealth, SystemHealth } from '@/features/admin/api';
import { cn } from '@/lib/utils';

/** Plain names for QUEUE_NAMES (shared/src/constants/queue.constants.ts). */
const QUEUE_LABELS: Record<string, string> = {
  'notifications': 'Notifications',
  'sms': 'SMS',
  'push-notifications': 'Announcement push',
  'incident-retry': 'Incident retry',
  'escalation': 'Escalation',
  'sla-monitor': 'SLA monitor',
  'location-processing': 'Location / ETA',
  'analytics-aggregation': 'Analytics',
  'audit-processing': 'Audit processing',
};

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
}

function queueHasProblem(q: QueueHealth): boolean {
  return q.status === 'error' || q.failed > 0;
}

/** True when anything on the health response needs the admin's attention. */
export function healthNeedsAttention(h: SystemHealth): boolean {
  return h.database === 'error' || h.redis === 'error' || h.queues.some(queueHasProblem);
}

function StateCard({ label, value, ok, icon: Icon }: {
  label: string;
  value: string;
  ok: boolean;
  icon: typeof Database;
}): JSX.Element {
  return (
    <div
      className={cn(
        'flex items-center gap-4 rounded-2xl border p-5',
        ok
          ? 'border-[rgba(13,96,83,0.16)] bg-agap-greenSoft'
          : 'border-[rgba(212,72,88,0.18)] bg-agap-dangerSoft',
      )}
    >
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', ok ? 'bg-agap-green/10' : 'bg-agap-danger/10')}>
        <Icon size={20} className={ok ? 'text-agap-green' : 'text-agap-danger'} />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-agap-textSub">{label}</p>
        <p className="text-base font-bold text-agap-textMain">{value}</p>
      </div>
      {ok
        ? <CheckCircle2 size={16} className="ml-auto shrink-0 text-agap-green" />
        : <XCircle size={16} className="ml-auto shrink-0 text-agap-danger" />}
    </div>
  );
}

function QueueTable({ queues }: { queues: QueueHealth[] }): JSX.Element {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[rgba(168,181,193,0.20)] bg-white shadow-card">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b border-[rgba(168,181,193,0.20)] text-left text-xs font-semibold uppercase tracking-wide text-agap-textSub">
            <th className="px-4 py-2.5">Queue</th>
            <th className="px-4 py-2.5 text-right">Waiting</th>
            <th className="px-4 py-2.5 text-right">Active</th>
            <th className="px-4 py-2.5 text-right">Delayed</th>
            <th className="px-4 py-2.5 text-right">Failed</th>
          </tr>
        </thead>
        <tbody>
          {queues.map((q) => {
            const problem = queueHasProblem(q);
            return (
              <tr key={q.name} className={cn('border-b border-[rgba(168,181,193,0.12)] last:border-0', problem && 'bg-agap-dangerSoft/60')}>
                <td className="px-4 py-2.5">
                  <span className="font-semibold text-agap-textMain">{QUEUE_LABELS[q.name] ?? q.name}</span>
                  <code className="ml-2 text-[11px] text-agap-textSub">{q.name}</code>
                </td>
                {q.status === 'error' ? (
                  <td colSpan={4} className="px-4 py-2.5 text-right text-xs font-semibold text-agap-danger">
                    Couldn&apos;t read counts
                  </td>
                ) : (
                  <>
                    <td className="px-4 py-2.5 text-right tabular-nums text-agap-textMain">{q.waiting}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-agap-textMain">{q.active}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-agap-textMain">{q.delayed}</td>
                    <td className={cn('px-4 py-2.5 text-right tabular-nums', q.failed > 0 ? 'font-bold text-agap-danger' : 'text-agap-textMain')}>
                      {q.failed}
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** System Administrator dashboard health: database, Redis and every background queue. */
export function HealthTab(): JSX.Element {
  const { data, isLoading, isError, dataUpdatedAt } = useSystemHealth();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
    );
  }

  if (!data) {
    // The endpoint itself failing is the worst state, not an empty one.
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-[rgba(212,72,88,0.18)] bg-agap-dangerSoft p-5 text-sm font-semibold text-agap-danger">
        <XCircle size={18} /> Health unavailable: the health endpoint could not be reached.
      </div>
    );
  }

  const queues = data.queues ?? [];
  const failedJobs = queues.reduce((sum, q) => sum + q.failed, 0);
  const unreadable = queues.filter((q) => q.status === 'error').length;
  const queuesOk = failedJobs === 0 && unreadable === 0;

  return (
    <div className="space-y-4">
      {healthNeedsAttention(data) && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-[rgba(212,72,88,0.18)] bg-agap-dangerSoft px-4 py-3 text-sm text-agap-danger">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          <p>
            <span className="font-bold">Needs attention.</span>{' '}
            {[
              data.database === 'error' && 'The database is not responding.',
              data.redis === 'error' && 'Redis is not responding: background jobs (SMS, push, SLA) are not running.',
              unreadable > 0 && `${unreadable} queue${unreadable === 1 ? '' : 's'} could not be read.`,
              failedJobs > 0 && `${failedJobs} failed job${failedJobs === 1 ? '' : 's'} kept in the queues below.`,
            ].filter(Boolean).join(' ')}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StateCard label="Database" value={data.database === 'ok' ? 'Healthy' : 'Error'} ok={data.database === 'ok'} icon={Database} />
        <StateCard label="Redis" value={data.redis === 'ok' ? 'Healthy' : 'Error'} ok={data.redis === 'ok'} icon={Cpu} />
        <StateCard
          label="Queues"
          value={queuesOk ? `${queues.length} healthy` : unreadable > 0 ? 'Unreadable' : `${failedJobs} failed`}
          ok={queuesOk}
          icon={Layers}
        />
      </div>

      {queues.length > 0 && <QueueTable queues={queues} />}

      <p className="text-xs text-agap-textSub">
        Checked {fmtDateTime(data.timestamp)} · refreshes every 60 seconds.
        {isError && dataUpdatedAt > 0 && ' The last refresh failed; showing the previous result.'}
      </p>
    </div>
  );
}

interface IntegrationRow {
  key: string;
  name: string;
  purpose: string;
  icon: typeof Database;
  configured: boolean;
  detail?: string;
  lastFailure?: { at: string; reason: string } | undefined;
}

/** One row per external integration: configured or not, and the last recorded failure. */
export function IntegrationsList(): JSX.Element {
  const { data, isLoading } = useSystemHealth();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
      </div>
    );
  }

  if (!data?.integrations) {
    return <EmptyState title="Integrations unavailable" description="Could not reach the health endpoint." />;
  }

  const { sms, push, maps } = data.integrations;
  const rows: IntegrationRow[] = [
    {
      key: 'sms',
      name: 'SMS gateway (Textbee)',
      purpose: 'Alert SMS path, barangay alerts, OTP codes',
      icon: MessageSquare,
      configured: sms.configured,
      lastFailure: sms.lastFailure,
    },
    {
      key: 'push',
      name: 'Push notifications (Firebase)',
      purpose: 'Reporter status updates, announcements, escalations',
      icon: BellRing,
      configured: push.configured,
    },
    {
      key: 'maps',
      name: 'Maps',
      purpose: 'Map tiles, geocoding, routing and ETA',
      icon: MapIcon,
      configured: maps.configured,
      detail: `Tiles: ${maps.tiles === 'maplibre' ? 'OpenStreetMap' : 'Mapbox'} · Routing: ${maps.routing === 'mapbox' ? 'Mapbox (traffic)' : 'OSRM'}`,
    },
  ];

  return (
    <div className="space-y-4">
      <ul className="overflow-hidden rounded-2xl border border-[rgba(168,181,193,0.20)] bg-white shadow-card">
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <li key={row.key} className="flex flex-col gap-3 border-b border-[rgba(168,181,193,0.12)] px-5 py-4 last:border-0 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-agap-surface">
                  <Icon size={18} className="text-agap-textMid" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-agap-textMain">{row.name}</p>
                  <p className="text-xs text-agap-textSub">{row.purpose}</p>
                  {row.detail && <p className="mt-0.5 text-xs text-agap-textSub">{row.detail}</p>}
                </div>
              </div>
              <div className="flex flex-col items-start gap-1 sm:items-end">
                <Badge variant={row.configured ? 'green' : 'red'}>{row.configured ? 'Configured' : 'Not configured'}</Badge>
                {row.key === 'sms' && (
                  row.lastFailure ? (
                    <p className="max-w-xs text-xs text-agap-danger sm:text-right">
                      Last failure {fmtDateTime(row.lastFailure.at)}: {row.lastFailure.reason}
                    </p>
                  ) : (
                    <p className="text-xs text-agap-textSub">No failed alert SMS on record</p>
                  )
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="space-y-1 text-xs text-agap-textSub">
        <p>
          &ldquo;Configured&rdquo; means the server has the required settings. It does not prove the provider accepts them:
          a rejected key shows up as failures in the logs (and, for barangay alerts, as a last failure above).
        </p>
        <p>
          Only barangay alert SMS are retried and recorded as failed jobs. Other SMS (OTP codes, contact notices) are
          best-effort and log their errors instead. Keys and device IDs are never shown here.
        </p>
        <p>Checked {fmtDateTime(data.timestamp)}.</p>
      </div>
    </div>
  );
}
