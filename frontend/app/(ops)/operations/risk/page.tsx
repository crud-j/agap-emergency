'use client';

import { type JSX } from 'react';
import dynamic from 'next/dynamic';
import { AlertTriangle, Droplets, Flame, MapPin, RefreshCw, XCircle } from 'lucide-react';
import { Badge, Card, CardHeader, CardTitle, Skeleton, EmptyState, Button } from '@/components/ui';
import type { BadgeVariant } from '@/components/ui';
import { useRiskHeatmap, useFloodZones, useRiskAreas } from '@/features/risk/hooks';

// Leaflet touches `window`; load client-side only.
const RiskHeatmapView = dynamic(
  () => import('@/components/risk/RiskHeatmapView').then((m) => m.RiskHeatmapView),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center rounded-2xl bg-agap-surface text-sm text-agap-textSub">
        Loading map…
      </div>
    ),
  },
);

const RISK_LEVEL_VARIANT: Record<string, BadgeVariant> = {
  LOW:      'green',
  MODERATE: 'amber',
  HIGH:     'red',
  EXTREME:  'red',
};

function riskLevelColor(level: string): string {
  const colors: Record<string, string> = {
    LOW:      '#16A34A',
    MODERATE: '#D97706',
    HIGH:     '#DC2626',
    EXTREME:  '#9B1C1C',
  };
  return colors[level] ?? '#8795A3';
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function Legend(): JSX.Element {
  return (
    <div className="rounded-2xl border border-[rgba(168,181,193,0.20)] bg-white p-4 shadow-card space-y-3">
      <p className="text-xs font-bold uppercase tracking-wide text-agap-textSub">Map Legend</p>
      <div className="space-y-2">
        <LegendRow color="#0D6053" label="Low incident density" />
        <LegendRow color="#D97706" label="Moderate incident density" />
        <LegendRow color="#DC2626" label="High incident density" />
      </div>
      <div className="border-t border-[rgba(168,181,193,0.20)] pt-2 space-y-2">
        <LegendOverlay color="#3B82F6" label="Flood-prone zone (MDRRMO)" />
        <LegendOverlay color="#DC2626" dashed label="Industrial / fireworks zone" />
        <LegendOverlay color="#0891B2" dashed label="Flood risk area (registry)" />
      </div>
      <div className="border-t border-[rgba(168,181,193,0.20)] pt-2 space-y-1.5">
        <p className="text-[10px] text-agap-textSub leading-snug">
          Circle size and colour show incident count per barangay. Flood and industrial
          overlays are advisory — not authoritative land boundaries.
        </p>
      </div>
    </div>
  );
}

function LegendRow({ color, label }: { color: string; label: string }): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <span className="text-xs text-agap-textMid">{label}</span>
    </div>
  );
}

function LegendOverlay({ color, label, dashed }: { color: string; label: string; dashed?: boolean }): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span
        className="h-3 w-6 shrink-0 rounded-sm"
        style={{
          backgroundColor: color + '28',
          border: `2px ${dashed ? 'dashed' : 'solid'} ${color}`,
        }}
      />
      <span className="text-xs text-agap-textMid">{label}</span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

/**
 * MOD-51 — Emergency Intelligence and Risk Visualization.
 * Incident density heatmap (CircleMarker per barangay) over Bocaue with
 * flood-prone zone overlays and risk area registry panel.
 */
export default function RiskPage(): JSX.Element {
  const heatmapQ = useRiskHeatmap();
  const floodQ = useFloodZones();
  const areasQ = useRiskAreas();

  const heatmap = heatmapQ.data ?? [];
  const floodZones = floodQ.data ?? [];
  const riskAreas = areasQ.data ?? [];

  const isLoading = heatmapQ.isLoading || floodQ.isLoading;
  const isError = heatmapQ.isError || floodQ.isError;

  const maxCount = Math.max(0, ...heatmap.map((h) => h.count));
  const topBarangays = [...heatmap]
    .filter((h) => h.barangay)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[560px] flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-agap-textMain">Risk Intelligence</h1>
          <p className="mt-1 text-sm text-agap-textSub">
            Bocaue MDRRMO · incident density and flood/industrial risk overlays
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            void heatmapQ.refetch();
            void floodQ.refetch();
            void areasQ.refetch();
          }}
          disabled={isLoading}
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          Refresh
        </Button>
      </div>

      {/* Error strip */}
      {isError && (
        <Card className="border-[rgba(212,72,88,0.22)] bg-agap-dangerSoft flex items-center gap-3">
          <XCircle size={16} className="text-agap-danger shrink-0" />
          <span className="text-sm text-agap-danger">
            Could not load risk data. Check your connection and refresh.
          </span>
        </Card>
      )}

      {/* Main layout: map + side panel */}
      <div className="min-h-0 flex-1 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
        {/* Map */}
        <Card padding="none" className="overflow-hidden">
          {isLoading ? (
            <div className="flex h-full items-center justify-center bg-agap-surface">
              <Skeleton className="h-full w-full rounded-2xl" />
            </div>
          ) : (
            <RiskHeatmapView heatmap={heatmap} floodZones={floodZones} riskAreas={riskAreas} />
          )}
        </Card>

        {/* Side panel */}
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          <Legend />

          {/* Top hotspot barangays */}
          <Card>
            <CardHeader>
              <CardTitle>Incident Hotspots</CardTitle>
            </CardHeader>
            {heatmapQ.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}
              </div>
            ) : topBarangays.length === 0 ? (
              <EmptyState icon={MapPin} title="No location data" description="Heatmap appears once incidents report GPS locations." className="py-8" />
            ) : (
              <ol className="space-y-1">
                {topBarangays.map((h, i) => (
                  <li key={h.barangay} className="flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-agap-surface text-[10px] font-bold text-agap-textSub">
                      {i + 1}
                    </span>
                    <span className="flex-1 truncate text-sm text-agap-textMain">{h.barangay}</span>
                    <span
                      className="min-w-[28px] text-right text-sm font-extrabold tabular-nums"
                      style={{
                        color: maxCount > 0 ? (
                          h.count / maxCount > 0.66 ? '#DC2626' :
                          h.count / maxCount > 0.33 ? '#D97706' : '#0D6053'
                        ) : '#0D6053',
                      }}
                    >
                      {h.count}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          {/* Flood zones */}
          <Card>
            <CardHeader>
              <CardTitle>
                <span className="flex items-center gap-1.5">
                  <Droplets size={15} className="text-agap-info" />
                  Flood Risk Areas
                </span>
              </CardTitle>
            </CardHeader>
            {floodQ.isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : floodZones.length === 0 ? (
              <p className="text-xs text-agap-textSub">No flood zones in registry.</p>
            ) : (
              <ul className="space-y-2">
                {floodZones.map((fz) => (
                  <li key={fz.id} className="flex items-start gap-2">
                    <span
                      className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: riskLevelColor(fz.risk_level) }}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-agap-textMain truncate">{fz.name}</p>
                      <p className="text-xs text-agap-textSub">
                        {fz.barangay ?? '—'}
                        {fz.flood_threshold_meters ? ` · ≥${fz.flood_threshold_meters} m` : ''}
                      </p>
                    </div>
                    <Badge variant={RISK_LEVEL_VARIANT[fz.risk_level] ?? 'muted'} className="shrink-0">
                      {fz.risk_level}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Other risk areas */}
          {riskAreas.filter((ra) => ra.risk_type !== 'FLOOD').length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>
                  <span className="flex items-center gap-1.5">
                    <Flame size={15} className="text-agap-danger" />
                    Other Risk Areas
                  </span>
                </CardTitle>
              </CardHeader>
              <ul className="space-y-2">
                {riskAreas
                  .filter((ra) => ra.risk_type !== 'FLOOD')
                  .map((ra) => (
                    <li key={ra.id} className="flex items-start gap-2">
                      <AlertTriangle size={13} className="mt-0.5 shrink-0 text-agap-amber" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-agap-textMain truncate">{ra.name}</p>
                        <p className="text-xs text-agap-textSub">
                          {ra.risk_type} · {ra.barangay ?? '—'}
                        </p>
                      </div>
                    </li>
                  ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
