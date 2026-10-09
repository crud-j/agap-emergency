'use client';

import { type JSX } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from 'recharts';
import { Activity, AlertTriangle, CheckCircle2, Clock, TrendingUp, XCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, StatCard, Skeleton, EmptyState } from '@/components/ui';
import { useVolume, useSlaCompliance, useFalseAlertRate, useResponseTimes } from '@/features/analytics/hooks';

// ─── Palette ─────────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  MEDICAL:      '#0D6053',
  ROAD_ACCIDENT:'#EA580C',
  FLOOD:        '#3B82F6',
  RESCUE:       '#D97706',
  FIRE:         '#DC2626',
  INDUSTRIAL:   '#CA8A04',
  DEBRIS:       '#8795A3',
  OTHER:        '#40536D',
};

const STATUS_COLORS: Record<string, string> = {
  SUBMITTED:       '#3B82F6',
  RECEIVED:        '#8B5CF6',
  ACKNOWLEDGED:    '#D97706',
  ASSESSED:        '#F59E0B',
  DISPATCH_PENDING:'#EA580C',
  DISPATCHED:      '#DC2626',
  EN_ROUTE:        '#B45309',
  ON_SCENE:        '#0D6053',
  TRANSPORTING:    '#0891B2',
  ASSISTING:       '#0891B2',
  RESOLVED:        '#16A34A',
  CLOSED:          '#64748B',
  CANCELLED:       '#94A3B8',
  FALSE_ALERT:     '#F43F5E',
  DUPLICATE:       '#A78BFA',
};

function labelCase(s: string): string {
  return s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function secsToMins(secs: number | null): number {
  if (secs == null) return 0;
  return Math.round(secs / 60);
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-[rgba(168,181,193,0.20)] bg-white px-3 py-2 shadow-card text-xs">
      <p className="mb-1 font-bold text-agap-textMain">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="font-semibold">
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
}

// ─── SLA Gauge ───────────────────────────────────────────────────────────────

function SlaGauge({ pct, label }: { pct: number; label: string }): JSX.Element {
  const color = pct >= 90 ? '#0D6053' : pct >= 70 ? '#D97706' : '#D44858';
  const gaugeData = [
    { value: pct, fill: color },
    { value: 100 - pct, fill: '#EDF1F4' },
  ];
  return (
    <div className="flex flex-col items-center gap-1">
      <PieChart width={100} height={100}>
        <Pie
          data={gaugeData}
          cx={50}
          cy={50}
          startAngle={90}
          endAngle={-270}
          innerRadius={32}
          outerRadius={46}
          dataKey="value"
          strokeWidth={0}
        >
          {gaugeData.map((entry, i) => (
            <Cell key={i} fill={entry.fill} />
          ))}
        </Pie>
      </PieChart>
      <span className="text-lg font-extrabold tabular-nums" style={{ color }}>{pct}%</span>
      <span className="text-xs text-agap-textSub text-center leading-tight">{label}</span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

/**
 * MOD-50 — Emergency Response Analytics.
 * Renders response-time, volume (category + status), and SLA compliance charts
 * from live backend aggregates. Palette maps to AGAP pearl/green tokens.
 */
export default function AnalyticsPage(): JSX.Element {
  const volumeQ = useVolume();
  const slaQ = useSlaCompliance();
  const falseQ = useFalseAlertRate();
  const rtQ = useResponseTimes();

  const volume = volumeQ.data;
  const sla = slaQ.data;
  const falseRate = falseQ.data;
  const rt = rtQ.data ?? [];

  const totalIncidents = falseRate?.totalIncidents ?? 0;

  // Bar data — volume by category
  const categoryData = (volume?.byCategory ?? []).map((g) => ({
    name: labelCase(g.category),
    count: g._count._all,
    fill: CATEGORY_COLORS[g.category] ?? '#8795A3',
  }));

  // Bar data — volume by status
  const statusData = (volume?.byStatus ?? []).map((g) => ({
    name: labelCase(g.status),
    count: g._count._all,
    fill: STATUS_COLORS[g.status] ?? '#8795A3',
  }));

  // Bar data — response times (seconds → minutes)
  const rtData = rt.map((g) => ({
    name: labelCase(g.category),
    Acknowledge: secsToMins(g._avg.acknowledge_duration_secs),
    Dispatch: secsToMins(g._avg.dispatch_duration_secs),
    'On-Scene': secsToMins(g._avg.response_duration_secs),
  }));

  const loading = volumeQ.isLoading || slaQ.isLoading || falseQ.isLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-agap-textMain">Emergency Response Analytics</h1>
        <p className="mt-1 text-sm text-agap-textSub">
          Bocaue MDRRMO · aggregate response metrics and SLA compliance
        </p>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Total Incidents"
          value={loading ? '—' : totalIncidents}
          icon={<Activity size={18} />}
          variant="default"
          loading={falseQ.isLoading}
        />
        <StatCard
          label="False Alerts"
          value={loading ? '—' : (falseRate?.falseAlerts ?? 0)}
          icon={<AlertTriangle size={18} />}
          variant={falseRate && falseRate.ratePct > 20 ? 'warning' : 'default'}
          loading={falseQ.isLoading}
          trendLabel={falseRate ? `${falseRate.ratePct}% rate` : undefined}
        />
        <StatCard
          label="Ack SLA"
          value={loading ? '—' : `${sla?.acknowledgeCompliancePct ?? 0}%`}
          icon={<CheckCircle2 size={18} />}
          variant={sla && sla.acknowledgeCompliancePct < 70 ? 'critical' : sla && sla.acknowledgeCompliancePct < 90 ? 'warning' : 'success'}
          loading={slaQ.isLoading}
        />
        <StatCard
          label="Dispatch SLA"
          value={loading ? '—' : `${sla?.dispatchCompliancePct ?? 0}%`}
          icon={<Clock size={18} />}
          variant={sla && sla.dispatchCompliancePct < 70 ? 'critical' : sla && sla.dispatchCompliancePct < 90 ? 'warning' : 'success'}
          loading={slaQ.isLoading}
        />
      </div>

      {/* Row: Volume by Category + SLA Compliance detail */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Volume by Category — 2/3 width */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Incident Volume by Category</CardTitle>
          </CardHeader>
          {volumeQ.isLoading ? (
            <Skeleton className="h-52 w-full" />
          ) : volumeQ.isError ? (
            <EmptyState icon={XCircle} title="Could not load volume data" description="Check your connection and retry." />
          ) : categoryData.length === 0 ? (
            <EmptyState icon={TrendingUp} title="No incidents recorded" description="Volume data will appear once incidents are submitted." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={categoryData} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#DCE3E9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#8795A3' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#8795A3' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="count" name="Incidents" radius={[4, 4, 0, 0]} maxBarSize={48}>
                  {categoryData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* SLA Compliance gauges — 1/3 width */}
        <Card>
          <CardHeader>
            <CardTitle>SLA Compliance</CardTitle>
          </CardHeader>
          {slaQ.isLoading ? (
            <div className="flex justify-around py-6">
              <Skeleton className="h-24 w-24 rounded-full" />
              <Skeleton className="h-24 w-24 rounded-full" />
            </div>
          ) : slaQ.isError ? (
            <EmptyState icon={XCircle} title="Could not load SLA data" />
          ) : (
            <>
              <div className="flex justify-around py-2">
                <SlaGauge pct={sla?.acknowledgeCompliancePct ?? 0} label="Acknowledge SLA" />
                <SlaGauge pct={sla?.dispatchCompliancePct ?? 0} label="Dispatch SLA" />
              </div>
              <div className="mt-3 space-y-1.5 border-t border-[rgba(168,181,193,0.20)] pt-3">
                <div className="flex justify-between text-xs text-agap-textMid">
                  <span>Total measured</span>
                  <span className="font-semibold tabular-nums">{sla?.total ?? 0}</span>
                </div>
                <div className="flex justify-between text-xs text-agap-textMid">
                  <span>Ack SLA met</span>
                  <span className="font-semibold tabular-nums">{sla?.acknowledgeSlaMet ?? 0}</span>
                </div>
                <div className="flex justify-between text-xs text-agap-textMid">
                  <span>Dispatch SLA met</span>
                  <span className="font-semibold tabular-nums">{sla?.dispatchSlaMet ?? 0}</span>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Response Times by Category */}
      <Card>
        <CardHeader>
          <CardTitle>Average Response Times by Category (minutes)</CardTitle>
        </CardHeader>
        {rtQ.isLoading ? (
          <Skeleton className="h-52 w-full" />
        ) : rtQ.isError ? (
          <EmptyState icon={XCircle} title="Could not load response time data" description="Check your connection and retry." />
        ) : rtData.length === 0 ? (
          <EmptyState icon={Clock} title="No response time data yet" description="Metrics appear once incidents are acknowledged and dispatched." />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={rtData} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#DCE3E9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#8795A3' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#8795A3' }} axisLine={false} tickLine={false} unit="m" />
              <Tooltip content={<ChartTooltip />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#40536D' }} />
              <Bar dataKey="Acknowledge" fill="#0D6053" radius={[4, 4, 0, 0]} maxBarSize={24} />
              <Bar dataKey="Dispatch" fill="#3B82F6" radius={[4, 4, 0, 0]} maxBarSize={24} />
              <Bar dataKey="On-Scene" fill="#D97706" radius={[4, 4, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Volume by Status */}
      <Card>
        <CardHeader>
          <CardTitle>Incident Count by Status</CardTitle>
        </CardHeader>
        {volumeQ.isLoading ? (
          <Skeleton className="h-44 w-full" />
        ) : volumeQ.isError ? (
          <EmptyState icon={XCircle} title="Could not load status data" />
        ) : statusData.length === 0 ? (
          <EmptyState icon={Activity} title="No status data" description="Status breakdown will appear once incidents are processed." />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={statusData}
              layout="vertical"
              margin={{ top: 4, right: 32, left: 80, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#DCE3E9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#8795A3' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#8795A3' }} axisLine={false} tickLine={false} width={76} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="count" name="Incidents" radius={[0, 4, 4, 0]} maxBarSize={20}>
                {statusData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  );
}
