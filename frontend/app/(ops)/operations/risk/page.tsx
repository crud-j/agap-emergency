'use client';

import { useMemo, useState, type JSX } from 'react';
import dynamic from 'next/dynamic';
import { AlertTriangle, Droplets, MapPin, RefreshCw, XCircle } from 'lucide-react';
import {
  Badge, Card, CardHeader, CardTitle, Skeleton, EmptyState, Button, Tabs, TabsList, TabsTrigger, TabsContent,
} from '@/components/ui';
import type { BadgeVariant } from '@/components/ui';
import { RiskAreasTab } from '@/components/admin/RiskAreasTab';
import { useRiskMap, useRiskAreas, useRiskAreaProposals } from '@/features/risk/hooks';
import { hasRole, useAuthUser } from '@/lib/use-auth';
import { ROLE } from '@/lib/role-access';
import { DEFAULT_RISK_MAP_PERIOD, RISK_MAP_PERIODS, type RiskMapPeriod } from '@/features/risk/api';
import { FLOOD_SHADES, RISK_POINT_CATEGORIES, riskCategoryColor } from '@/features/risk/categories';
import { formatRadius } from '@/features/risk/area-geo';
import { titleCase } from '@/lib/incident-format';

// MapLibre GL uses WebGL + Web Workers; must be client-side only.
const RiskMapView = dynamic(
  () => import('@/components/risk/RiskMapView').then((m) => m.RiskMapView),
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
  LOW: 'green',
  MODERATE: 'amber',
  HIGH: 'red',
  CRITICAL: 'red',
};

const PERIOD_LABEL: Record<RiskMapPeriod, string> = { 30: '30 days', 90: '90 days', 365: '12 months' };

// ─── Legend ───────────────────────────────────────────────────────────────────

function Legend({
  counts, visible, onToggle,
}: {
  counts: Array<[string, number]>;
  visible: ReadonlySet<string>;
  onToggle: (category: string) => void;
}): JSX.Element {
  return (
    <div className="rounded-2xl border border-[rgba(168,181,193,0.20)] bg-white p-4 shadow-card space-y-3">
      <p className="text-xs font-bold uppercase tracking-wide text-agap-textSub">Incidents (tap to hide)</p>
      {counts.length === 0 ? (
        <p className="text-xs text-agap-textSub">No incidents outside floods in this period.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {counts.map(([category, n]) => {
            const on = visible.has(category);
            return (
              <button
                key={category}
                type="button"
                onClick={() => onToggle(category)}
                aria-pressed={on}
                className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition ${
                  on ? 'border-[rgba(168,181,193,0.40)] text-agap-textMain' : 'border-dashed border-[rgba(168,181,193,0.40)] text-agap-textSub opacity-60'
                }`}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: riskCategoryColor(category) }} />
                {titleCase(category)}
                <span className="tabular-nums text-agap-textSub">{n}</span>
              </button>
            );
          })}
        </div>
      )}
      <div className="border-t border-[rgba(168,181,193,0.20)] pt-2 space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-3 w-12 shrink-0 overflow-hidden rounded-sm">
            {FLOOD_SHADES.map((c) => <span key={c} className="flex-1" style={{ backgroundColor: c }} />)}
          </span>
          <span className="text-xs text-agap-textMid">Flood reports per barangay (few → many)</span>
        </div>
        <LegendOutline color="#2563EB" dashed label="Flood-prone barangay" />
        <LegendOutline color="#DC2626" dashed label="Fireworks industry barangay" />
        <LegendOutline color="#D97706" label="Registered risk area (colour = level)" />
      </div>
      <p className="border-t border-[rgba(168,181,193,0.20)] pt-2 text-[10px] text-agap-textSub leading-snug">
        A dot is where reports came from; the number is how many came from that spot. Floods are
        counted per barangay. Boundaries: © OpenStreetMap contributors.
      </p>
    </div>
  );
}

function LegendOutline({ color, label, dashed }: { color: string; label: string; dashed?: boolean }): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span
        className="h-3 w-6 shrink-0 rounded-sm"
        style={{ backgroundColor: color + '20', border: `2px ${dashed ? 'dashed' : 'solid'} ${color}` }}
      />
      <span className="text-xs text-agap-textMid">{label}</span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

/**
 * MOD-51 — Emergency Intelligence and Risk Visualization (Dispatcher and Supervisor).
 * Floods per barangay on the real boundaries; every other incident where it happened.
 * The Supervisor also manages risk areas and approves hotspot proposals (second tab);
 * the API refuses those writes from anyone else.
 */
export default function RiskPage(): JSX.Element {
  const canManage = hasRole(useAuthUser(), ROLE.SUPERVISOR);
  const [tab, setTab] = useState<'map' | 'areas'>('map');
  const proposals = useRiskAreaProposals(canManage);
  const pendingProposals = proposals.data?.length ?? 0;
  const [period, setPeriod] = useState<RiskMapPeriod>(DEFAULT_RISK_MAP_PERIOD);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const mapQ = useRiskMap(period);
  const areasQ = useRiskAreas();

  const map = mapQ.data;
  // Deactivated areas stay in the Risk areas list, not on the map.
  const areas = useMemo(() => (areasQ.data ?? []).filter((a) => a.is_active), [areasQ.data]);

  const categoryCounts = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const p of map?.points ?? []) totals[p.category] = (totals[p.category] ?? 0) + p.incident_count;
    return RISK_POINT_CATEGORIES.filter((c) => totals[c]).map((c) => [c, totals[c]!] as [string, number]);
  }, [map]);

  const visible = useMemo(
    () => new Set<string>(RISK_POINT_CATEGORIES.filter((c) => !hidden.has(c))),
    [hidden],
  );

  const floodBarangays = useMemo(
    () => (map?.barangays ?? []).filter((b) => b.flood_incidents > 0).sort((a, b) => b.flood_incidents - a.flood_incidents),
    [map],
  );
  // The API sorts points busiest first.
  const busiestSpots = useMemo(
    () => (map?.points ?? []).filter((p) => visible.has(p.category)).slice(0, 8),
    [map, visible],
  );

  const toggle = (category: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category); else next.add(category);
      return next;
    });

  const isError = mapQ.isError || areasQ.isError;
  const onMap = !canManage || tab === 'map';

  const mapBody = (
    <>
      {isError && (
        <Card className="border-[rgba(212,72,88,0.22)] bg-agap-dangerSoft flex items-center gap-3">
          <XCircle size={16} className="text-agap-danger shrink-0" />
          <span className="text-sm text-agap-danger">
            Could not load {mapQ.isError ? 'the risk map' : 'the risk areas'}. Check your connection and refresh.
          </span>
        </Card>
      )}

      {map?.points_truncated && (
        <Card className="flex items-center gap-3 border-[rgba(217,119,6,0.25)] bg-agap-amberSoft">
          <AlertTriangle size={16} className="shrink-0 text-agap-amber" />
          <span className="text-sm text-agap-textMain">
            Too many spots to show at once: only the busiest are on the map. Pick a shorter period to see all of them.
          </span>
        </Card>
      )}

      <div className="min-h-0 flex-1 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
        {/* Map */}
        <Card padding="none" className="overflow-hidden min-h-[360px]">
          {map ? (
            <RiskMapView map={map} areas={areas} categories={visible} />
          ) : (
            <div className="flex h-full items-center justify-center bg-agap-surface">
              {mapQ.isLoading ? <Skeleton className="h-full w-full rounded-2xl" /> : null}
            </div>
          )}
        </Card>

        {/* Side panel */}
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          <Legend counts={categoryCounts} visible={visible} onToggle={toggle} />

          <Card>
            <CardHeader>
              <CardTitle>
                <span className="flex items-center gap-1.5">
                  <Droplets size={15} className="text-agap-info" />
                  Flood reports by barangay
                </span>
              </CardTitle>
            </CardHeader>
            {mapQ.isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : floodBarangays.length === 0 ? (
              <p className="text-xs text-agap-textSub">No flood reports in the last {PERIOD_LABEL[period]}.</p>
            ) : (
              <ol className="space-y-1">
                {floodBarangays.map((b) => (
                  <li key={b.name} className="flex items-center gap-2">
                    <span className="flex-1 truncate text-sm text-agap-textMain">{b.name}</span>
                    <span className="min-w-[28px] text-right text-sm font-extrabold tabular-nums text-agap-info">
                      {b.flood_incidents}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Busiest spots</CardTitle>
            </CardHeader>
            {mapQ.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}
              </div>
            ) : busiestSpots.length === 0 ? (
              <EmptyState icon={MapPin} title="No incidents" description={`Nothing shown for the last ${PERIOD_LABEL[period]}.`} className="py-6" />
            ) : (
              <ol className="space-y-1.5">
                {busiestSpots.map((p) => (
                  <li key={`${p.category}-${p.lat}-${p.lng}`} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: riskCategoryColor(p.category) }} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-agap-textMain">{titleCase(p.category)}</p>
                      <p className="truncate text-xs text-agap-textSub">{p.barangay ?? 'Outside barangay boundaries'}</p>
                    </div>
                    <span className="min-w-[28px] text-right text-sm font-extrabold tabular-nums text-agap-textMain">
                      {p.incident_count}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Risk areas</CardTitle>
            </CardHeader>
            {areasQ.isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : areas.length === 0 ? (
              <p className="text-xs text-agap-textSub">No active risk areas in the registry.</p>
            ) : (
              <ul className="space-y-2">
                {areas.map((a) => (
                  <li key={a.id} className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-agap-textMain">{a.name}</p>
                      <p className="text-xs text-agap-textSub">
                        {titleCase(a.risk_type)} · {a.barangay ?? '—'}
                        {a.flood_threshold_meters ? ` · ≥${a.flood_threshold_meters} m` : ''}
                        {a.shape === 'PIN' && a.pin ? ` · ${formatRadius(a.pin.radius_m)} around a pin` : ''}
                        {a.shape === 'NONE' ? ' · not on map (no place)' : ''}
                      </p>
                    </div>
                    <Badge variant={RISK_LEVEL_VARIANT[a.risk_level] ?? 'muted'} className="shrink-0">
                      {a.risk_level}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[560px] flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-agap-textMain">Risk Intelligence</h1>
          <p className="mt-1 text-sm text-agap-textSub">
            Bocaue MDRRMO · floods by barangay, other incidents where they happened
          </p>
        </div>
        {onMap && <div className="flex items-center gap-2">
          <div role="group" aria-label="Period" className="flex rounded-xl border border-[rgba(168,181,193,0.30)] bg-white p-0.5">
            {RISK_MAP_PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                aria-pressed={period === p}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  period === p ? 'bg-agap-green text-white' : 'text-agap-textMid hover:bg-agap-surface'
                }`}
              >
                {PERIOD_LABEL[p]}
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { void mapQ.refetch(); void areasQ.refetch(); }}
            disabled={mapQ.isFetching}
          >
            <RefreshCw size={14} className={mapQ.isFetching ? 'animate-spin' : ''} />
            Refresh
          </Button>
        </div>}
      </div>

      {canManage ? (
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="self-start">
            <TabsTrigger value="map">Map</TabsTrigger>
            <TabsTrigger value="areas">
              Risk areas
              {pendingProposals > 0 && (
                <span
                  className="ml-1.5 rounded-full bg-agap-amber px-1.5 text-[10px] font-bold text-white"
                  aria-label={`${pendingProposals} proposed areas to review`}
                >
                  {pendingProposals}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="map" className="mt-3 flex min-h-0 flex-1 flex-col gap-4">{mapBody}</TabsContent>
          <TabsContent value="areas" className="mt-3 min-h-0 flex-1 overflow-y-auto">
            <RiskAreasTab canManage />
          </TabsContent>
        </Tabs>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4">{mapBody}</div>
      )}
    </div>
  );
}
