'use client';

import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useWsState } from '@/lib/use-ws-state';
import {
  fetchMapConfig,
  fetchRiskData,
  fetchLiveResponderPositions,
  fetchIncidentLocations,
  fetchLatestUnitPositions,
  fetchRoute,
  type LatestUnitPosition,
  type LiveResponderPosition,
} from './api';

export function useMapStyle(): string {
  const { data } = useQuery({
    queryKey: ['map-config'],
    queryFn: fetchMapConfig,
    staleTime: Infinity,
  });
  return data?.styleUrl ?? 'https://demotiles.maplibre.org/style.json';
}

export function useRiskData(periodDays = 30) {
  return useQuery({
    queryKey: ['risk-data', periodDays],
    queryFn: () => fetchRiskData(periodDays),
    staleTime: 5 * 60_000,
  });
}

/** REST poll while the socket is down (plan §19); the socket patches the caches otherwise. */
const DISCONNECTED_POLL_MS = 15_000;

export function useLiveResponders() {
  const offline = useWsState() === 'offline';
  return useQuery({
    queryKey: ['live-responders'],
    queryFn: fetchLiveResponderPositions,
    staleTime: 10_000,
    refetchInterval: offline ? DISCONNECTED_POLL_MS : 30_000,
  });
}

export function useIncidentLocations(params?: { status?: string; category?: string }) {
  return useQuery({
    queryKey: ['incident-locations', params],
    queryFn: () => fetchIncidentLocations(params),
    staleTime: 15_000,
  });
}

/** Update a single responder's position in the live-responders cache (called by SocketProvider). */
export function usePatchResponderPosition() {
  const qc = useQueryClient();
  return (patch: LiveResponderPosition) => {
    qc.setQueryData<LiveResponderPosition[]>(['live-responders'], (old) => {
      if (!old) return [patch];
      const idx = old.findIndex((r) => r.responderId === patch.responderId);
      if (idx === -1) return [...old, patch];
      return old.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    });
  };
}

/**
 * Units actively responding to one incident (GET /locations/tracking/:id/latest).
 * Seeds the dispatch card's per-unit ETA and a position for units the ops feed
 * hasn't seen yet; `responder.eta_updated` patches it (see SocketProvider).
 */
function incidentUnitsQuery(incidentId: string | null, enabled: boolean, offline: boolean) {
  return {
    queryKey: ['incident-units', incidentId],
    queryFn: () => fetchLatestUnitPositions(incidentId!),
    enabled: !!incidentId && enabled,
    staleTime: 15_000,
    refetchInterval: offline ? DISCONNECTED_POLL_MS : 60_000,
  };
}

export function useIncidentUnits(incidentId: string | null, enabled = true) {
  const offline = useWsState() === 'offline';
  return useQuery(incidentUnitsQuery(incidentId, enabled, offline));
}

/**
 * The same per-incident unit caches for several incidents (ops map): leg, hospital and
 * server route of every tracked unit. Shares ['incident-units', id] with the dispatch
 * page, so the socket patches reach both.
 */
export function useIncidentsUnits(incidentIds: readonly string[]) {
  const offline = useWsState() === 'offline';
  return useQueries({
    queries: incidentIds.map((id) => incidentUnitsQuery(id, true, offline)),
    combine: allUnits,
  });
}

// Module-level so TanStack keeps the combined array stable between renders.
function allUnits(results: Array<{ data: LatestUnitPosition[] | undefined }>): LatestUnitPosition[] {
  return results.flatMap((r) => r.data ?? []);
}

// ~11 m precision: avoids refetching the route on GPS jitter (same as mobile useRouteLine).
const round4 = (n: number) => n.toFixed(4);

/**
 * Client-side driving route between two points (MOD-43): the fallback while the
 * server has not sent a route for the unit's current leg. Keyed on rounded
 * coordinates and refreshed every 20 s. Best-effort: a routing failure just
 * means no line; the markers and the rest of the map still render.
 */
export function useRouteLine(
  from: { lat: number; lng: number } | null,
  to: { lat: number; lng: number } | null,
) {
  const key = from && to ? `${round4(from.lat)},${round4(from.lng)}->${round4(to.lat)},${round4(to.lng)}` : null;
  return useQuery({
    queryKey: ['route-line', key],
    queryFn: () => fetchRoute(from!, to!),
    enabled: !!key,
    staleTime: 15_000,
    refetchInterval: 20_000,
    retry: false,
  });
}
