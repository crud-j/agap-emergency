'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchRiskHeatmap, fetchFloodZones, fetchRiskAreas, fetchRiskPatterns } from './api';

export function useRiskHeatmap() {
  return useQuery({
    queryKey: ['risk-heatmap'],
    queryFn: fetchRiskHeatmap,
    staleTime: 120_000,
  });
}

export function useFloodZones() {
  return useQuery({
    queryKey: ['risk-flood-zones'],
    queryFn: fetchFloodZones,
    staleTime: 120_000,
  });
}

export function useRiskAreas() {
  return useQuery({
    queryKey: ['risk-areas'],
    queryFn: fetchRiskAreas,
    staleTime: 120_000,
  });
}

export function useRiskPatterns() {
  return useQuery({
    queryKey: ['risk-patterns'],
    queryFn: fetchRiskPatterns,
    staleTime: 120_000,
  });
}
