'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchIncidents,
  fetchIncident,
  acknowledgeIncident,
  assessIncident,
  closeIncident,
  cancelIncident,
  markFalseAlert,
  mergeIncident,
  submitAssessment,
  updateIncidentStatus,
  createResolution,
  fetchResolution,
  fetchReporterStanding,
  type IncidentListParams,
  type SubmitAssessmentBody,
  type CreateResolutionBody,
  fetchIncidentTransports,
  updateIncidentTransport,
  rejectAttachment,
} from './api';

export function useIncidents(params?: IncidentListParams, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['incidents', params],
    queryFn: () => fetchIncidents(params),
    staleTime: 30_000,
    enabled: opts?.enabled ?? true,
  });
}

/** Verified Reporter standing of the incident's reporter (dispatcher drawer). */
export function useReporterStanding(id: string | null) {
  return useQuery({
    queryKey: ['reporter-standing', id],
    queryFn: () => fetchReporterStanding(id!),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useIncident(id: string | null) {
  return useQuery({
    queryKey: ['incident', id],
    queryFn: () => fetchIncident(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

function useIncidentMutation<TArgs>(
  mutationFn: (args: TArgs) => Promise<unknown>,
  invalidateId?: (args: TArgs) => string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (_data, args) => {
      qc.invalidateQueries({ queryKey: ['incidents'] });
      const id = invalidateId?.(args);
      if (id) {
        qc.invalidateQueries({ queryKey: ['incident', id] });
        qc.invalidateQueries({ queryKey: ['dispatch-incident', id] });
      }
    },
  });
}

export function useAcknowledgeIncident() {
  return useIncidentMutation<string>(acknowledgeIncident, (id) => id);
}

export function useAssessIncident() {
  return useIncidentMutation<string>(assessIncident, (id) => id);
}

export function useRejectAttachment() {
  return useIncidentMutation<{ incidentId: string; attachmentId: string; notes?: string }>(
    ({ incidentId, attachmentId, notes }) => rejectAttachment(incidentId, attachmentId, notes),
    ({ incidentId }) => incidentId,
  );
}

export function useCloseIncident() {
  return useIncidentMutation<{ id: string; notes?: string }>(
    ({ id, notes }) => closeIncident(id, notes),
    ({ id }) => id,
  );
}

export function useCancelIncident() {
  return useIncidentMutation<{ id: string; reason: string }>(
    ({ id, reason }) => cancelIncident(id, reason),
    ({ id }) => id,
  );
}

export function useMarkFalseAlert() {
  return useIncidentMutation<{ id: string; notes?: string }>(
    ({ id, notes }) => markFalseAlert(id, notes),
    ({ id }) => id,
  );
}

export function useUpdateIncidentStatus() {
  return useIncidentMutation<{ id: string; status: string; reason?: string }>(
    ({ id, status, reason }) => updateIncidentStatus(id, status, reason),
    ({ id }) => id,
  );
}

export function useMergeIncident() {
  return useIncidentMutation<{ id: string; duplicateOfId: string }>(
    ({ id, duplicateOfId }) => mergeIncident(id, duplicateOfId),
    ({ id }) => id,
  );
}

export function useIncidentResolution(id: string | null, enabled = true) {
  return useQuery({
    queryKey: ['incident-resolution', id],
    queryFn: () => fetchResolution(id!),
    enabled: !!id && enabled,
    retry: false, // 404 before a resolution exists is normal
  });
}

export function useCreateResolution() {
  return useIncidentMutation<{ id: string; body: CreateResolutionBody }>(
    ({ id, body }) => createResolution(id, body),
    ({ id }) => id,
  );
}

export function useSubmitAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ incidentId, body }: { incidentId: string; body: SubmitAssessmentBody }) =>
      submitAssessment(incidentId, body),
    onSuccess: (_data, { incidentId }) => {
      qc.invalidateQueries({ queryKey: ['incident', incidentId] });
    },
  });
}

export function useIncidentTransports(id: string | null) {
  return useQuery({
    queryKey: ['incident-transports', id],
    queryFn: () => fetchIncidentTransports(id!),
    enabled: !!id,
    refetchInterval: 20_000,
  });
}

export function useUpdateIncidentTransport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ incidentId, transportId, body }: {
      incidentId: string;
      transportId: string;
      body: { destinationId: string; estimatedArrivalAt?: string; changeReason?: string };
    }) => updateIncidentTransport(incidentId, transportId, body),
    onSuccess: (_data, { incidentId }) => {
      qc.invalidateQueries({ queryKey: ['incident-transports', incidentId] });
      qc.invalidateQueries({ queryKey: ['incident', incidentId] });
    },
  });
}
