'use client';

import type { JSX } from 'react';
import Link from 'next/link';
import {
  Activity, AlertOctagon, ArrowRight, CalendarDays, Clock, History, Plus, Truck, WifiOff,
} from 'lucide-react';
import { Badge, Skeleton, StatCard } from '@/components/ui';
import { DashboardBanners } from '@/components/dashboard/DashboardBanners';
import { DashboardPanel } from '@/components/dashboard/DashboardPanel';
import { useMunicipalOverview } from '@/features/analytics/hooks';
import type { MunicipalOverview as Overview } from '@/features/analytics/api';
import { useAnnouncements } from '@/features/announcements/hooks';
import { categoryLabel as announcementCategory, fmtManila, severityMeta } from '@/features/announcements/labels';
import { categoryIcon, formatDurationSec as fmtDuration, titleCase } from '@/lib/incident-format';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';

/** Shared rule 5: say so when the counts stop refreshing. */
const STALE_AFTER_MS = 3 * 60_000;
const LATEST_ANNOUNCEMENTS = 5;

/** "+2 vs yesterday" — plain differences; percentages mislead on small counts. */
function vsYesterday(today: number, yesterday: number): string {
  const diff = today - yesterday;
  if (diff === 0) return 'same as yesterday';
  return `${diff > 0 ? '+' : '−'}${Math.abs(diff)} vs yesterday`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' });
}

/** `YYYY-MM-DD` (a Manila calendar day) → "Mon 20". */
function fmtDay(date: string): string {
  return new Date(`${date}T12:00:00+08:00`).toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila', weekday: 'short', day: 'numeric',
  });
}

/** Ranked magnitude list: one hue, bar length = share of the largest row. */
function RankedBars({ rows, empty, icon }: {
  rows: { key: string; label: string; count: number }[];
  empty: string;
  icon?: (key: string) => JSX.Element;
}): JSX.Element {
  if (rows.length === 0) return <p className="text-sm text-agap-textSub">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.count));
  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.key} className="grid grid-cols-[minmax(0,9rem)_1fr_2.5rem] items-center gap-3">
          <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-agap-textMid">
            {icon?.(row.key)}
            <span className="truncate">{row.label}</span>
          </span>
          <span className="h-2 rounded-full bg-agap-surface" aria-hidden>
            <span
              className="block h-2 rounded-full bg-agap-green"
              style={{ width: `${Math.max(4, (row.count / max) * 100)}%` }}
            />
          </span>
          <span className="text-right font-mono text-[13px] font-semibold tabular-nums text-agap-textMain">{row.count}</span>
        </li>
      ))}
    </ul>
  );
}

/** 7-day trend: one stacked bar per day (critical + other = total), one axis. */
function TrendChart({ trend }: { trend: Overview['trend7d'] }): JSX.Element {
  const max = Math.max(1, ...trend.map((d) => d.total));
  return (
    <div>
      <div className="mb-3 flex items-center gap-4 text-[11px] text-agap-textSub">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-agap-danger" aria-hidden />Critical</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-agap-track" aria-hidden />Other</span>
      </div>
      <div className="flex h-36 items-end gap-2 border-b border-agap-track/50" aria-hidden>
        {trend.map((d) => {
          const other = d.total - d.critical;
          return (
            <div
              key={d.date}
              className="group relative flex h-full flex-1 flex-col justify-end"
              title={`${fmtDay(d.date)}: ${d.total} incidents, ${d.critical} critical`}
            >
              <span className="pointer-events-none absolute -top-1 left-1/2 z-10 hidden -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-agap-textMain px-2 py-1 text-[11px] text-white shadow-card group-hover:block">
                {fmtDay(d.date)} · {d.total} total · {d.critical} critical
              </span>
              <span className="mb-1 text-center font-mono text-[11px] tabular-nums text-agap-textSub">
                {d.total > 0 ? d.total : ''}
              </span>
              <div className="mx-auto flex w-full max-w-[28px] flex-col gap-[2px]">
                {other > 0 && (
                  <span
                    className={cn('block bg-agap-track', 'rounded-t-[4px]')}
                    style={{ height: `${(other / max) * 112}px` }}
                  />
                )}
                {d.critical > 0 && (
                  <span
                    className={cn('block bg-agap-danger', other === 0 && 'rounded-t-[4px]')}
                    style={{ height: `${(d.critical / max) * 112}px` }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-2" aria-hidden>
        {trend.map((d) => (
          <span key={d.date} className="flex-1 text-center text-[11px] text-agap-textSub">{fmtDay(d.date)}</span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Incidents per day, last 7 days</caption>
        <thead><tr><th>Day</th><th>Total</th><th>Critical</th></tr></thead>
        <tbody>
          {trend.map((d) => (
            <tr key={d.date}><td>{fmtDay(d.date)}</td><td>{d.total}</td><td>{d.critical}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Dashboard for the LGU Information Officer (ANNOUNCEMENTS_PUBLISHER), spec §2.
 * Counts only, from GET /analytics/municipal-overview: no incident list, names,
 * addresses, coordinates or unit positions ever reach this page.
 */
export function MunicipalOverview(): JSX.Element {
  const query = useMunicipalOverview();
  const announcements = useAnnouncements({ status: 'PUBLISHED', page: 1, perPage: LATEST_ANNOUNCEMENTS });
  const now = useNow(15_000);

  const data = query.data;
  const loading = query.isLoading;
  const stale = !!data && now - query.dataUpdatedAt > STALE_AFTER_MS;
  const criticalActive = data?.activeByPriority.find((p) => p.priority === 'CRITICAL')?.count ?? 0;
  const perf = data?.performance7d;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold leading-tight tracking-tight text-agap-textMain">
            Office of the Mayor — Municipal Overview
          </h1>
          <p className="mt-0.5 text-[13px] text-agap-textSub">
            Bocaue, Bulacan · emergency counts across the municipality
            {data && <> · Last updated {fmtTime(new Date(query.dataUpdatedAt).toISOString())}</>}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            href="/announcements/compose"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#126247] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[#0F543D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#126247]/40"
          >
            <Plus size={15} /> Create announcement
          </Link>
          <Link
            href="/announcements/history"
            className="inline-flex items-center gap-1.5 rounded-lg border border-agap-track/60 bg-white px-3.5 py-2 text-sm font-semibold text-agap-textMain hover:bg-agap-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-agap-green/40"
          >
            <History size={15} /> Publication history
          </Link>
        </div>
      </div>

      <DashboardBanners />

      {(stale || (query.isError && !data)) && (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-[rgba(217,119,6,0.25)] bg-agap-amberSoft px-4 py-2.5 text-sm text-agap-textMid">
          <WifiOff size={15} className="shrink-0 text-agap-amber" aria-hidden />
          {data
            ? `These counts have not refreshed since ${fmtTime(new Date(query.dataUpdatedAt).toISOString())}. They may be out of date.`
            : 'Couldn’t load the municipal overview. Retrying every minute.'}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active incidents"
          value={data ? data.active : '—'}
          trendLabel={data ? `${data.today.resolved} resolved today` : undefined}
          icon={<Activity size={17} />}
          loading={loading}
        />
        <StatCard
          label="Critical, active"
          value={data ? criticalActive : '—'}
          trendLabel={data ? `${data.today.critical} reported today · ${vsYesterday(data.today.critical, data.yesterday.critical)}` : undefined}
          icon={<AlertOctagon size={17} />}
          variant={criticalActive > 0 ? 'critical' : 'default'}
          loading={loading}
        />
        <StatCard
          label="Incidents today"
          value={data ? data.today.total : '—'}
          trendLabel={data ? vsYesterday(data.today.total, data.yesterday.total) : undefined}
          icon={<CalendarDays size={17} />}
          loading={loading}
        />
        <StatCard
          label="Units deployed"
          value={data ? `${data.units.deployed} / ${data.units.deployed + data.units.available}` : '—'}
          trendLabel={data ? `${data.units.available} available · ${data.units.unavailable} out of service` : undefined}
          icon={<Truck size={17} />}
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DashboardPanel title="Active incidents by barangay">
          {loading || !data ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <RankedBars
              rows={data.activeByBarangay.map((r) => ({ key: r.barangay, label: r.barangay, count: r.count }))}
              empty="No active incidents in any barangay."
            />
          )}
        </DashboardPanel>
        <DashboardPanel title="Active incidents by category">
          {loading || !data ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <RankedBars
              rows={data.activeByCategory.map((r) => ({ key: r.category, label: titleCase(r.category), count: r.count }))}
              empty="No active incidents."
              icon={(category) => {
                const Icon = categoryIcon(category);
                return <Icon size={13} className="shrink-0 text-agap-textSub" aria-hidden />;
              }}
            />
          )}
        </DashboardPanel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]">
        <DashboardPanel title="Incidents, last 7 days">
          {loading || !data ? <Skeleton className="h-44 w-full" /> : <TrendChart trend={data.trend7d} />}
        </DashboardPanel>
        <DashboardPanel title="Response performance, last 7 days">
          {loading || !perf ? (
            <Skeleton className="h-44 w-full" />
          ) : (
            <dl className="space-y-3">
              {[
                ['Report to acknowledgement', fmtDuration(perf.acknowledgeSec)],
                ['Report to dispatch', fmtDuration(perf.dispatchSec)],
                ['Dispatch to arrival on scene', fmtDuration(perf.arrivalSec)],
                ['Resolved or closed', perf.resolvedShare === null ? '—' : `${Math.round(perf.resolvedShare * 100)}%`],
              ].map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-3">
                  <dt className="flex items-center gap-1.5 text-[13px] text-agap-textMid">
                    <Clock size={13} className="text-agap-textSub" aria-hidden />{label}
                  </dt>
                  <dd className="font-mono text-[15px] font-semibold tabular-nums text-agap-textMain">{value}</dd>
                </div>
              ))}
              <p className="pt-1 text-[11px] text-agap-textSub">
                Averages over incidents reported in the last 7 days. “—” means no incident has reached that step yet.
              </p>
            </dl>
          )}
        </DashboardPanel>
      </div>

      <DashboardPanel
        title="Latest announcements"
        action={(
          <Link href="/announcements" className="flex items-center gap-1 text-[12px] font-semibold text-agap-green hover:text-agap-green/80">
            View all <ArrowRight size={13} />
          </Link>
        )}
      >
        {announcements.isError ? (
          <p className="text-sm text-agap-danger">Couldn&apos;t load announcements.</p>
        ) : announcements.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (announcements.data?.data ?? []).length === 0 ? (
          <p className="text-sm text-agap-textSub">No published announcements.</p>
        ) : (
          <ul className="-my-2 divide-y divide-agap-track/15">
            {(announcements.data?.data ?? []).map((a) => {
              const sev = severityMeta(a.severity);
              return (
                <li key={a.id} className="flex items-center gap-3 py-2.5">
                  <span className={cn('h-7 w-1 shrink-0 rounded-full', sev.bar)} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-agap-textMain">{a.title}</p>
                    <p className="truncate text-[11px] text-agap-textSub">
                      {announcementCategory(a.category)} · {fmtManila(a.published_at)}
                    </p>
                  </div>
                  <Badge variant={sev.variant}>{sev.label}</Badge>
                </li>
              );
            })}
          </ul>
        )}
      </DashboardPanel>
    </div>
  );
}
