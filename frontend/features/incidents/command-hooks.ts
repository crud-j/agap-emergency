'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchIcs,
  activateIcs,
  updateIcs,
  deactivateIcs,
  addIcsPosition,
  removeIcsPosition,
  setIncidentCommander,
  fetchAgencies,
  fetchAvailableAgencies,
  addAgency,
  fetchHandovers,
  fetchHandoverRecipients,
  createHandover,
  acknowledgeHandover,
  fetchMutualAidRequests,
  createMutualAidRequest,
  approveMutualAid,
  denyMutualAid,
  type MutualAidListParams,
  type IcsStructure,
} from './command';

// ─── ICS hooks (MOD-36) ───────────────────────────────────────────────────────

/** 404 = this incident has never been under command; that is normal, so no retry. */
export function useIncidentIcs(incidentId: string | null) {
  return useQuery({
    queryKey: ['incident-ics', incidentId],
    queryFn: () => fetchIcs(incidentId!),
    enabled: !!incidentId,
    staleTime: 30_000,
    retry: false,
  });
}

/** Every ICS write returns the whole command: cache it and refresh the lists. */
function useIcsMutation<V extends { incidentId: string }>(fn: (v: V) => Promise<IcsStructure>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (data, { incidentId }) => {
      qc.setQueryData(['incident-ics', incidentId], data);
      qc.invalidateQueries({ queryKey: ['oversight', 'major-incidents'] });
      qc.invalidateQueries({ queryKey: ['audit-incident', incidentId] });
    },
  });
}

export function useActivateIcs() {
  return useIcsMutation(({ incidentId, objectives, commanderUserId }: {
    incidentId: string; objectives: string[]; commanderUserId?: string;
  }) => activateIcs(incidentId, objectives, commanderUserId));
}

export function useUpdateIcs() {
  return useIcsMutation(({ incidentId, data }: {
    incidentId: string; data: { objectives?: string[]; situationNotes?: string | null };
  }) => updateIcs(incidentId, data));
}

export function useDeactivateIcs() {
  return useIcsMutation(({ incidentId }: { incidentId: string }) => deactivateIcs(incidentId));
}

export function useAddIcsPosition() {
  return useIcsMutation(({ incidentId, data }: {
    incidentId: string; data: { userId: string; position: string; organizationId?: string };
  }) => addIcsPosition(incidentId, data));
}

export function useSetIncidentCommander() {
  return useIcsMutation(({ incidentId, userId }: { incidentId: string; userId: string }) =>
    setIncidentCommander(incidentId, userId));
}

export function useRemoveIcsPosition() {
  return useIcsMutation(({ incidentId, posId }: { incidentId: string; posId: string }) =>
    removeIcsPosition(incidentId, posId));
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

export function useHandoverRecipients(enabled: boolean) {
  return useQuery({
    queryKey: ['handover-recipients'],
    queryFn: fetchHandoverRecipients,
    enabled,
    staleTime: 60_000,
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
