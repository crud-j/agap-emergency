'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchMapConfig,
  fetchRiskData,
  fetchLiveResponderPositions,
  fetchIncidentLocations,
  fetchLatestUnitPositions,
  fetchRoute,
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

export function useLiveResponders() {
  return useQuery({
    queryKey: ['live-responders'],
    queryFn: fetchLiveResponderPositions,
    staleTime: 10_000,
    refetchInterval: 30_000,
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
export function useIncidentUnits(incidentId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['incident-units', incidentId],
    queryFn: () => fetchLatestUnitPositions(incidentId!),
    enabled: !!incidentId && enabled,
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}

// ~11 m precision: avoids refetching the route on GPS jitter (same as mobile useRouteLine).
const round4 = (n: number) => n.toFixed(4);

/**
 * Driving route from the tracked unit to the scene (MOD-43). Keyed on rounded
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
