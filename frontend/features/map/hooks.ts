'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchRiskData,
  fetchLiveResponderPositions,
  fetchIncidentLocations,
  type LiveResponderPosition,
} from './api';

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
