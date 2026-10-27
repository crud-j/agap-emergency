'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchRiskHeatmap, fetchFloodZones, fetchRiskAreas, fetchRiskPatterns,
  createRiskArea, updateRiskArea, deleteRiskArea,
  type RiskAreaChanges, type RiskAreaInput,
} from './api';

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

/** Every query that shows risk areas: the list, flood zones and the heatmap. */
function useInvalidateRisk() {
  const qc = useQueryClient();
  return () => Promise.all(
    ['risk-areas', 'risk-flood-zones', 'risk-heatmap'].map((key) => qc.invalidateQueries({ queryKey: [key] })),
  );
}

export function useCreateRiskArea() {
  const invalidate = useInvalidateRisk();
  return useMutation({
    mutationFn: (body: RiskAreaInput) => createRiskArea(body),
    onSuccess: invalidate,
  });
}

export function useUpdateRiskArea() {
  const invalidate = useInvalidateRisk();
  return useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: RiskAreaChanges }) => updateRiskArea(id, changes),
    onSuccess: invalidate,
  });
}

export function useDeleteRiskArea() {
  const invalidate = useInvalidateRisk();
  return useMutation({
    mutationFn: (id: string) => deleteRiskArea(id),
    onSuccess: invalidate,
  });
}
