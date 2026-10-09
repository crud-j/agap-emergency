'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchIcs,
  activateIcs,
  updateIcs,
  deactivateIcs,
  addIcsPosition,
  removeIcsPosition,
  fetchAgencies,
  fetchAvailableAgencies,
  addAgency,
  fetchHandovers,
  createHandover,
  acknowledgeHandover,
  fetchMutualAidRequests,
  createMutualAidRequest,
  approveMutualAid,
  denyMutualAid,
  type MutualAidListParams,
} from './command';

// ─── ICS hooks (MOD-36) ───────────────────────────────────────────────────────

export function useIncidentIcs(incidentId: string | null) {
  return useQuery({
    queryKey: ['incident-ics', incidentId],
    queryFn: () => fetchIcs(incidentId!),
    enabled: !!incidentId,
    staleTime: 30_000,
    retry: false, // 404 when no ICS is normal — don't retry
  });
}

export function useActivateIcs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ incidentId, objectives }: { incidentId: string; objectives: string[] }) =>
      activateIcs(incidentId, objectives),
    onSuccess: (_data, { incidentId }) => {
      qc.invalidateQueries({ queryKey: ['incident-ics', incidentId] });
      qc.invalidateQueries({ queryKey: ['incident', incidentId] });
    },
  });
}

export function useUpdateIcs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      incidentId,
      data,
    }: {
      incidentId: string;
      data: { objectives?: string[]; situationNotes?: string };
    }) => updateIcs(incidentId, data),
    onSuccess: (_data, { incidentId }) => {
      qc.invalidateQueries({ queryKey: ['incident-ics', incidentId] });
    },
  });
}

export function useDeactivateIcs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (incidentId: string) => deactivateIcs(incidentId),
    onSuccess: (_data, incidentId) => {
      qc.invalidateQueries({ queryKey: ['incident-ics', incidentId] });
      qc.invalidateQueries({ queryKey: ['incident', incidentId] });
    },
  });
}

export function useAddIcsPosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      incidentId,
      data,
    }: {
      incidentId: string;
      data: { userId: string; position: string; organizationId?: string };
    }) => addIcsPosition(incidentId, data),
    onSuccess: (_data, { incidentId }) => {
      qc.invalidateQueries({ queryKey: ['incident-ics', incidentId] });
    },
  });
}

export function useRemoveIcsPosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ incidentId, posId }: { incidentId: string; posId: string }) =>
      removeIcsPosition(incidentId, posId),
    onSuccess: (_data, { incidentId }) => {
      qc.invalidateQueries({ queryKey: ['incident-ics', incidentId] });
    },
  });
}

// ─── Agency hooks (MOD-34) ────────────────────────────────────────────────────

export function useIncidentAgencies(incidentId: string | null) {
  return useQuery({
    queryKey: ['incident-agencies', incidentId],
    queryFn: () => fetchAgencies(incidentId!),
    enabled: !!incidentId,
    staleTime: 30_000,
  });
}

export function useAvailableAgencies(incidentId: string | null, orgType?: string) {
  return useQuery({
    queryKey: ['available-agencies', incidentId, orgType],
    queryFn: () => fetchAvailableAgencies(incidentId!, orgType),
    enabled: !!incidentId,
    staleTime: 30_000,
  });
}

export function useAddAgency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      incidentId,
      organizationId,
      roleInIncident,
    }: {
      incidentId: string;
      organizationId: string;
      roleInIncident?: string;
    }) => addAgency(incidentId, organizationId, roleInIncident),
    onSuccess: (_data, { incidentId }) => {
      qc.invalidateQueries({ queryKey: ['incident-agencies', incidentId] });
      qc.invalidateQueries({ queryKey: ['available-agencies', incidentId] });
    },
  });
}

// ─── Handover hooks (MOD-44) ──────────────────────────────────────────────────

export function useHandovers(incidentId: string | null) {
  return useQuery({
    queryKey: ['handovers', incidentId],
    queryFn: () => fetchHandovers(incidentId!),
    enabled: !!incidentId,
    staleTime: 30_000,
  });
}

export function useCreateHandover() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      incidentId,
      data,
    }: {
      incidentId: string;
      data: { toUserId: string; situationSummary: string; pendingActions?: string[] };
    }) => createHandover(incidentId, data),
    onSuccess: (_data, { incidentId }) => {
      qc.invalidateQueries({ queryKey: ['handovers', incidentId] });
    },
  });
}

export function useAcknowledgeHandover() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (incidentId: string) => acknowledgeHandover(incidentId),
    onSuccess: (_data, incidentId) => {
      qc.invalidateQueries({ queryKey: ['handovers', incidentId] });
    },
  });
}

// ─── Mutual Aid hooks (MOD-35) ────────────────────────────────────────────────

export function useMutualAidRequests(params?: MutualAidListParams) {
  return useQuery({
    queryKey: ['mutual-aid', params],
    queryFn: () => fetchMutualAidRequests(params),
    staleTime: 30_000,
  });
}

export function useCreateMutualAidRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createMutualAidRequest,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mutual-aid'] }),
  });
}

export function useApproveMutualAid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      approveMutualAid(id, notes),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mutual-aid'] }),
  });
}

export function useDenyMutualAid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      denyMutualAid(id, notes),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mutual-aid'] }),
  });
}
