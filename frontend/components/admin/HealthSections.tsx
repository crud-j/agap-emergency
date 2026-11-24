'use client';

import type { JSX, ReactNode } from 'react';
import Link from 'next/link';
import {
  CheckCircle2, XCircle, AlertTriangle, Database, Cpu, Layers, HardDrive,
  MessageSquare, BellRing, Map as MapIcon, RefreshCw, ArrowRight, MinusCircle,
} from 'lucide-react';
import { Badge, Skeleton, EmptyState } from '@/components/ui';
import { useSystemHealth } from '@/features/admin/hooks';
import type { QueueHealth, SystemHealth } from '@/features/admin/api';
import { cn } from '@/lib/utils';
import {
  TONE_BAR, TONE_TEXT, fmtBytes, fmtDateTime, fmtDuration, fmtNumber, fmtRelative,
  latencyTone, usageTone, type Tone,
} from './format';

/** Plain names for QUEUE_NAMES (shared/src/constants/queue.constants.ts); unknown names show as-is. */
const QUEUE_LABELS: Record<string, { label: string; purpose: string }> = {
  'notifications': { label: 'Notifications', purpose: 'Push to reporters and staff' },
  'sms': { label: 'SMS', purpose: 'Every outbound text through Textbee' },
  'push-notifications': { label: 'Announcement push', purpose: 'MOD-53 broadcasts' },
  'incident-retry': { label: 'Incident retry', purpose: 'Offline resend handling' },
  'escalation': { label: 'Escalation', purpose: 'Supervisor escalations' },
  'sla-monitor': { label: 'SLA monitor', purpose: 'Response-target checks' },
  'location-processing': { label: 'Location / ETA', purpose: 'Routing and ETA refresh' },
  'analytics-aggregation': { label: 'Analytics', purpose: 'Nightly rollups' },
  'audit-processing': { label: 'Audit processing', purpose: 'Audit trail writes' },
  'ai-assist': { label: 'AI assist', purpose: 'Summaries and triage hints' },
};

function queueHasProblem(q: QueueHealth): boolean {
  return q.status === 'error' || q.failed > 0;
}

/** True when anything on the health response needs the admin's attention. */
export function healthNeedsAttention(h: SystemHealth): boolean {
  return h.database === 'error' || h.redis === 'error' || h.storage === 'error' || h.queues.some(queueHasProblem);
}

// ─── Building blocks ─────────────────────────────────────────────────────────

type ServiceState = 'ok' | 'down' | 'off';

const STATE_STYLE: Record<ServiceState, { label: string; badge: 'green' | 'red' | 'muted'; icon: typeof CheckCircle2; ring: string }> = {
  ok: { label: 'Operational', badge: 'green', icon: CheckCircle2, ring: 'border-agap-track/60' },
  down: { label: 'Not responding', badge: 'red', icon: XCircle, ring: 'border-[rgba(207,59,78,0.35)]' },
  off: { label: 'Not configured', badge: 'muted', icon: MinusCircle, ring: 'border-agap-track/60' },
};

function Metric({ label, value, tone = 'none', hint }: { label: string; value: string; tone?: Tone; hint?: string }): JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5" title={hint}>
      <dt className="text-xs text-agap-textSub">{label}</dt>
      <dd className={cn('text-[13px] font-semibold tabular-nums', tone === 'none' ? 'text-agap-textMain' : TONE_TEXT[tone])}>{value}</dd>
    </div>
  );
}

function UsageBar({ label, used, max, format }: {
  label: string;
  used: number | null | undefined;
  max: number | null | undefined;
  format: (n: number | null | undefined) => string;
}): JSX.Element {
  const limited = !!max && max > 0;
  const tone = usageTone(used, max);
  const share = limited && used ? Math.min(1, used / max!) : 0;
  return (
    <div className="py-1.5">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="text-xs text-agap-textSub">{label}</span>
        <span className="text-[13px] font-semibold tabular-nums text-agap-textMain">
          {format(used)}
          <span className="font-normal text-agap-textSub"> / {limited ? format(max) : 'no limit'}</span>
        </span>
      </div>
      {limited && (
        <div className="h-1.5 overflow-hidden rounded-full bg-agap-track" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)} aria-label={label}>
          <div className={cn('h-full rounded-full transition-[width]', TONE_BAR[tone])} style={{ width: `${Math.max(2, share * 100)}%` }} />
        </div>
      )}
    </div>
  );
}

function ServiceCard({ title, subtitle, icon: Icon, state, latencyMs, latencyTone: tone, footer, children }: {
  title: string;
  subtitle: string;
  icon: typeof Database;
  state: ServiceState;
  latencyMs?: number | null | undefined;
  latencyTone?: Tone;
  footer?: ReactNode;
  children: ReactNode;
}): JSX.Element {
  const style = STATE_STYLE[state];
  return (
    <section className={cn('flex flex-col rounded-2xl border bg-white p-5 shadow-card', style.ring)} aria-label={title}>
      <header className="flex items-start gap-3">
        <div className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
          state === 'down' ? 'bg-agap-dangerSoft text-agap-danger' : state === 'off' ? 'bg-agap-surface text-agap-textSub' : 'bg-agap-greenSoft text-agap-green',
        )}>
          <Icon size={19} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-agap-textMain">{title}</h3>
          <p className="truncate text-xs text-agap-textSub">{subtitle}</p>
        </div>
        <Badge variant={style.badge} className="shrink-0">
          <style.icon size={12} /> {style.label}
        </Badge>
      </header>

      {latencyMs !== undefined && (
        <div className="mt-4 flex items-baseline gap-1.5">
          <span className={cn('font-mono text-[28px] font-bold leading-none tabular-nums', latencyMs === null ? 'text-agap-textSub' : TONE_TEXT[tone ?? 'none'])}>
            {latencyMs === null ? '—' : latencyMs}
          </span>
          <span className="text-xs text-agap-textSub">{latencyMs === null ? 'no response' : 'ms response'}</span>
        </div>
      )}

      <dl className="mt-3 divide-y divide-agap-track/40 border-t border-agap-track/40 pt-1">{children}</dl>
      {footer && <div className="mt-auto pt-3">{footer}</div>}
    </section>
  );
}

// ─── Health tab ──────────────────────────────────────────────────────────────

/** System Administrator dashboard health: database, Redis, storage, SMS and every background queue. */
export function HealthTab(): JSX.Element {
  const { data, isLoading, isError, dataUpdatedAt, refetch, isFetching } = useSystemHealth();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-14 rounded-2xl" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  if (!data) {
    // The endpoint itself failing is the worst state, not an empty one.
    return (
      <div role="alert" className="flex items-center gap-3 rounded-2xl border border-[rgba(212,72,88,0.18)] bg-agap-dangerSoft p-5 text-sm font-semibold text-agap-danger">
        <XCircle size={18} /> Health unavailable: the health endpoint could not be reached.
        <button type="button" onClick={() => void refetch()} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-current px-3 py-1.5 text-xs">
          <RefreshCw size={13} /> Try again
        </button>
      </div>
    );
  }

  const queues = data.queues ?? [];
  const failedJobs = queues.reduce((sum, q) => sum + q.failed, 0);
  const unreadable = queues.filter((q) => q.status === 'error').length;
  const db = data.details?.database;
  const redis = data.details?.redis;
  const storage = data.details?.storage;
  const sms = data.integrations.sms;

  const problems = [
    data.database === 'error' && 'The database is not responding.',
    data.redis === 'error' && 'Redis is not responding: background jobs (SMS, push, SLA) are not running.',
    data.storage === 'error' && (storage?.configured === false
      ? 'Object storage is not configured: photos and ID scans cannot be saved.'
      : `Object storage is not responding: new photos and ID scans ${storage?.localFallback ? 'go to the server disk (lost on redeploy)' : 'are refused'}.`),
    !sms.configured && 'The SMS gateway is not configured: ops alerts and OTP codes are not sent.',
    unreadable > 0 && `${unreadable} queue${unreadable === 1 ? '' : 's'} could not be read.`,
    failedJobs > 0 && `${failedJobs} failed job${failedJobs === 1 ? '' : 's'} kept in the queues below.`,
  ].filter((p): p is string => Boolean(p));

  const smsFailed24h = (sms.last24h?.failed ?? 0) + (sms.last24h?.notConfigured ?? 0);
  const smsState: ServiceState = !sms.configured ? 'off' : 'ok';

  return (
    <div className="space-y-4">
      {/* Overall status */}
      <div
        role={problems.length > 0 ? 'alert' : 'status'}
        className={cn(
          'flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3',
          problems.length > 0
            ? 'border-[rgba(212,72,88,0.22)] bg-agap-dangerSoft text-agap-danger'
            : 'border-[rgba(13,96,83,0.16)] bg-agap-greenSoft text-agap-green',
        )}
      >
        {problems.length > 0 ? <AlertTriangle size={18} className="shrink-0" /> : <CheckCircle2 size={18} className="shrink-0" />}
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-bold">
            {problems.length > 0 ? `${problems.length} item${problems.length === 1 ? '' : 's'} need${problems.length === 1 ? 's' : ''} attention` : 'All systems operational'}
          </p>
          {problems.length > 0 && <p className="mt-0.5">{problems.join(' ')}</p>}
        </div>
        <div className="flex items-center gap-3 text-xs text-agap-textSub">
          <span title={fmtDateTime(data.timestamp)}>
            Checked {fmtRelative(data.timestamp)}
            {data.checkDurationMs !== undefined && ` in ${data.checkDurationMs} ms`}
          </span>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 rounded-lg border border-agap-track bg-white px-2.5 py-1.5 font-semibold text-agap-textMid hover:bg-agap-surface disabled:opacity-60"
          >
            <RefreshCw size={13} className={cn(isFetching && 'animate-spin')} /> {isFetching ? 'Checking…' : 'Check now'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ServiceCard
          title="Database"
          subtitle={db?.version ? `PostgreSQL ${db.version}${db.postgisVersion ? ` · PostGIS ${db.postgisVersion}` : ''}` : 'PostgreSQL'}
          icon={Database}
          state={data.database === 'ok' ? 'ok' : 'down'}
          latencyMs={db?.latencyMs ?? null}
          latencyTone={latencyTone(db?.latencyMs, 50, 250)}
        >
          <Metric label="Database size" value={fmtBytes(db?.sizeBytes)} />
          <UsageBar label="Connections" used={db?.connections} max={db?.maxConnections} format={fmtNumber} />
        </ServiceCard>

        <ServiceCard
          title="Redis"
          subtitle={redis?.version ? `Redis ${redis.version} · up ${fmtDuration(redis.uptimeSeconds)}` : 'Queues and cache'}
          icon={Cpu}
          state={data.redis === 'ok' ? 'ok' : 'down'}
          latencyMs={redis?.latencyMs ?? null}
          latencyTone={latencyTone(redis?.latencyMs, 25, 150)}
        >
          <UsageBar label="Memory" used={redis?.usedMemoryBytes} max={redis?.maxMemoryBytes} format={fmtBytes} />
          <Metric
            label="Eviction policy"
            value={redis?.memoryPolicy ?? '—'}
            tone={redis?.memoryPolicy && redis.memoryPolicy !== 'noeviction' ? 'warn' : 'none'}
            hint="BullMQ needs noeviction, or queued jobs can be dropped under memory pressure"
          />
          <Metric label="Clients · keys" value={`${fmtNumber(redis?.connectedClients)} · ${fmtNumber(redis?.keys)}`} />
        </ServiceCard>

        <ServiceCard
          title="Object storage"
          subtitle={storage ? storage.provider : 'Photos, videos and ID scans'}
          icon={HardDrive}
          state={data.storage === undefined ? 'off' : storage?.configured === false ? 'off' : data.storage === 'ok' ? 'ok' : 'down'}
          latencyMs={storage?.latencyMs ?? null}
          latencyTone={latencyTone(storage?.latencyMs, 400, 1500)}
        >
          <Metric label="Incident files" value={fmtNumber(storage?.incidentFiles)} />
          <Metric label="Incident file size" value={fmtBytes(storage?.incidentFileBytes)} />
          <Metric
            label="Local disk fallback"
            value={storage ? (storage.localFallback ? 'On' : 'Off') : '—'}
            tone={storage?.localFallback ? 'warn' : 'none'}
            hint="On: uploads go to the server's disk when the bucket fails. Railway's disk is wiped on every redeploy."
          />
        </ServiceCard>

        <ServiceCard
          title="SMS gateway"
          subtitle={sms.configured ? 'Textbee · gateway phone SIM' : 'Textbee not set up'}
          icon={MessageSquare}
          state={smsState}
          footer={
            <Link href="/administration/sms" className="inline-flex items-center gap-1 text-xs font-semibold text-agap-green hover:text-agap-green/80">
              SMS activity <ArrowRight size={12} />
            </Link>
          }
        >
          <Metric label="Accepted (24 h)" value={sms.last24h ? fmtNumber(sms.last24h.accepted) : '—'} />
          <Metric label="Failed (24 h)" value={sms.last24h ? fmtNumber(smsFailed24h) : '—'} tone={smsFailed24h > 0 ? 'bad' : 'none'} />
          <Metric label="Inbound (24 h)" value={fmtNumber(sms.inbound24h)} />
          <Metric label="Last accepted" value={fmtRelative(sms.lastAcceptedAt)} />
          {sms.lastFailure && (
            <p className="pt-2 text-xs text-agap-danger" title={fmtDateTime(sms.lastFailure.at)}>
              Last failure {fmtRelative(sms.lastFailure.at)}: {sms.lastFailure.reason}
            </p>
          )}
        </ServiceCard>
      </div>

      {queues.length > 0 && <QueueTable queues={queues} />}

      <p className="text-xs text-agap-textSub">
        Every value is read live from the server · refreshes every 60 seconds.
        {isError && dataUpdatedAt > 0 && ' The last refresh failed; showing the previous result.'}
      </p>
    </div>
  );
}

function QueueTable({ queues }: { queues: QueueHealth[] }): JSX.Element {
  return (
    <section className="overflow-hidden rounded-2xl border border-agap-track/60 bg-white shadow-card" aria-label="Background queues">
      <header className="flex items-center gap-2 border-b border-agap-track/40 px-5 py-3">
        <Layers size={15} className="text-agap-textSub" />
        <h3 className="text-[13px] font-bold text-agap-textMain">Background queues</h3>
        <span className="text-xs text-agap-textSub">BullMQ on Redis · {queues.length} queues</span>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="border-b border-agap-track/40 bg-agap-surface/60 text-left text-xs font-semibold uppercase tracking-wide text-agap-textSub">
              <th className="px-5 py-2.5">Queue</th>
              <th className="px-4 py-2.5 text-right">Waiting</th>
              <th className="px-4 py-2.5 text-right">Active</th>
              <th className="px-4 py-2.5 text-right">Delayed</th>
              <th className="px-4 py-2.5 text-right">Failed</th>
              <th className="px-5 py-2.5 text-right">State</th>
            </tr>
          </thead>
          <tbody>
            {queues.map((q) => {
              const problem = queueHasProblem(q);
              const info = QUEUE_LABELS[q.name];
              const busy = q.waiting + q.active > 0;
              return (
                <tr key={q.name} className={cn('border-b border-agap-track/30 last:border-0', problem && 'bg-agap-dangerSoft/50')}>
                  <td className="px-5 py-2.5">
                    <p className="font-semibold text-agap-textMain">{info?.label ?? q.name}</p>
                    <p className="text-[11px] text-agap-textSub">{info?.purpose ?? <code>{q.name}</code>}</p>
                  </td>
                  {q.status === 'error' ? (
                    <td colSpan={4} className="px-4 py-2.5 text-right text-xs font-semibold text-agap-danger">Couldn&apos;t read counts</td>
                  ) : (
                    <>
                      <td className="px-4 py-2.5 text-right tabular-nums text-agap-textMain">{q.waiting}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-agap-textMain">{q.active}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-agap-textMain">{q.delayed}</td>
                      <td className={cn('px-4 py-2.5 text-right tabular-nums', q.failed > 0 ? 'font-bold text-agap-danger' : 'text-agap-textMain')}>{q.failed}</td>
                    </>
                  )}
                  <td className="px-5 py-2.5 text-right">
                    <Badge variant={problem ? 'red' : busy ? 'blue' : 'muted'}>
                      {q.status === 'error' ? 'Unreadable' : q.failed > 0 ? 'Has failures' : busy ? 'Working' : 'Idle'}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── Integrations ────────────────────────────────────────────────────────────

interface IntegrationRow {
  key: string;
  name: string;
  purpose: string;
  icon: typeof Database;
  configured: boolean;
  facts: string[];
  problem?: string | undefined;
  link?: { href: string; label: string } | undefined;
}

/** One row per external integration: configured or not, plus what the server measured. */
export function IntegrationsList(): JSX.Element {
  const { data, isLoading } = useSystemHealth();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
      </div>
    );
  }

  if (!data?.integrations) {
    return <EmptyState title="Integrations unavailable" description="Could not reach the health endpoint." />;
  }

  const { sms, push, maps } = data.integrations;
  const storage = data.details?.storage;
  const rows: IntegrationRow[] = [
    {
      key: 'sms',
      name: 'SMS gateway (Textbee)',
      purpose: 'Ops alert SMS, barangay alerts, citizen SOS replies, OTP codes',
      icon: MessageSquare,
      configured: sms.configured,
      facts: [
        sms.last24h ? `${fmtNumber(sms.last24h.accepted)} accepted, ${fmtNumber(sms.last24h.failed + sms.last24h.notConfigured)} failed in 24 h` : 'SMS log unavailable',
        `Last accepted ${fmtRelative(sms.lastAcceptedAt)}`,
      ],
      problem: sms.lastFailure ? `Last failure ${fmtRelative(sms.lastFailure.at)}: ${sms.lastFailure.reason}` : undefined,
      link: { href: '/administration/sms', label: 'SMS activity' },
    },
    {
      key: 'push',
      name: 'Push notifications (Firebase)',
      purpose: 'Reporter status updates, responder assignments, announcements',
      icon: BellRing,
      configured: push.configured,
      facts: [push.registeredDevices === null || push.registeredDevices === undefined ? 'Device count unavailable' : `${fmtNumber(push.registeredDevices)} registered device${push.registeredDevices === 1 ? '' : 's'}`],
    },
    {
      key: 'storage',
      name: `Object storage${storage ? ` (${storage.provider})` : ''}`,
      purpose: 'Incident photos and videos, ID scans, profile photos',
      icon: HardDrive,
      configured: storage?.configured ?? false,
      facts: storage
        ? [
            storage.latencyMs === null ? 'Bucket did not answer' : `Bucket answered in ${storage.latencyMs} ms`,
            `Local disk fallback ${storage.localFallback ? 'on' : 'off'}`,
          ]
        : ['Not reported by this server version'],
      problem: data.storage === 'error' && storage?.configured ? 'The bucket is not responding.' : undefined,
    },
    {
      key: 'maps',
      name: 'Maps',
      purpose: 'Map tiles, geocoding, routing and ETA',
      icon: MapIcon,
      configured: maps.configured,
      facts: [`Tiles: ${maps.tiles === 'maplibre' ? 'OpenStreetMap' : 'Mapbox'}`, `Routing: ${maps.routing === 'mapbox' ? 'Mapbox (traffic)' : 'OSRM'}`],
    },
  ];

  return (
    <div className="space-y-4">
      <ul className="overflow-hidden rounded-2xl border border-agap-track/60 bg-white shadow-card">
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <li key={row.key} className="flex flex-col gap-3 border-b border-agap-track/30 px-5 py-4 last:border-0 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-agap-surface">
                  <Icon size={18} className="text-agap-textMid" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-agap-textMain">{row.name}</p>
                  <p className="text-xs text-agap-textSub">{row.purpose}</p>
                  <p className="mt-0.5 text-xs text-agap-textMid">{row.facts.join(' · ')}</p>
                </div>
              </div>
              <div className="flex flex-col items-start gap-1 sm:items-end">
                <Badge variant={row.configured ? 'green' : 'red'}>{row.configured ? 'Configured' : 'Not configured'}</Badge>
                {row.problem && <p className="max-w-xs text-xs text-agap-danger sm:text-right">{row.problem}</p>}
                {row.link && (
                  <Link href={row.link.href} className="inline-flex items-center gap-1 text-xs font-semibold text-agap-green hover:text-agap-green/80">
                    {row.link.label} <ArrowRight size={12} />
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="space-y-1 text-xs text-agap-textSub">
        <p>
          &ldquo;Configured&rdquo; means the server has the required settings. The counts come from the server&apos;s own
          records: the SMS log, registered devices, and a live request to the bucket.
        </p>
        <p>
          &ldquo;Accepted&rdquo; means Textbee took the SMS; delivery still depends on the gateway phone&apos;s load and
          signal. Keys, device IDs and phone numbers are never shown here.
        </p>
        <p>Checked {fmtDateTime(data.timestamp)}.</p>
      </div>
    </div>
  );
}
