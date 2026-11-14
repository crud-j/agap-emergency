'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchRiskMap, fetchRiskAreas,
  createRiskArea, updateRiskArea, deleteRiskArea,
  fetchRiskAreaProposals, approveRiskAreaProposal, dismissRiskAreaProposal,
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
