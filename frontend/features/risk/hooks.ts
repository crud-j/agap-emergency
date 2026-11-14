'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchRiskMap, fetchRiskAreas,
  createRiskArea, updateRiskArea, deleteRiskArea,
  fetchRiskAreaProposals, approveRiskAreaProposal, dismissRiskAreaProposal,
  fetchAreaSuggestion, fetchHotspotStatus, runHotspotCheck,
  type RiskAreaChanges, type RiskAreaInput, type ApproveProposalInput, type RiskMapPeriod,
} from './api';

export function useRiskMap(periodDays: RiskMapPeriod) {
  return useQuery({
    queryKey: ['risk-map', periodDays],
    queryFn: () => fetchRiskMap(periodDays),
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

/** The risk-area list, which both the Risk Map and Administration → Risk Areas read. */
function useInvalidateRisk() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['risk-areas'] });
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

/** Supervisor only (C7). Refreshed by the nightly job, so no polling. */
export function useRiskAreaProposals(enabled = true) {
  return useQuery({
    queryKey: ['risk-area-proposals'],
    queryFn: fetchRiskAreaProposals,
    staleTime: 120_000,
    enabled,
  });
}

/** Add-form help for a pin. `q` null (no pin yet) does nothing; the caller debounces it. */
export function useAreaSuggestion(q: { lat: number; lng: number; radius: number; riskType: string } | null) {
  return useQuery({
    queryKey: ['risk-area-suggestion', q],
    queryFn: () => fetchAreaSuggestion(q!),
    enabled: q !== null,
    staleTime: 60_000,
    retry: false,
  });
}

/** When the hotspot check last ran and when it runs next (Supervisor only). */
export function useHotspotStatus(enabled = true) {
  return useQuery({
    queryKey: ['risk-hotspot-status'],
    queryFn: fetchHotspotStatus,
    staleTime: 60_000,
    enabled,
  });
}

/** "Check now": runs the check, then refreshes its status, the proposals and the areas. */
export function useRunHotspotCheck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: runHotspotCheck,
    onSuccess: (status) => {
      qc.setQueryData(['risk-hotspot-status'], { lastRun: status.lastRun, nextRunAt: status.nextRunAt });
      return Promise.all([
        qc.invalidateQueries({ queryKey: ['risk-area-proposals'] }),
        qc.invalidateQueries({ queryKey: ['risk-areas'] }),
      ]);
    },
  });
}

export function useApproveRiskAreaProposal() {
  const qc = useQueryClient();
  const invalidate = useInvalidateRisk();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ApproveProposalInput }) => approveRiskAreaProposal(id, body),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ['risk-area-proposals'] }), invalidate()]),
  });
}

export function useDismissRiskAreaProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => dismissRiskAreaProposal(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['risk-area-proposals'] }),
  });
}
