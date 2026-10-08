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
  type IncidentListParams,
  type SubmitAssessmentBody,
} from './api';

export function useIncidents(params?: IncidentListParams) {
  return useQuery({
    queryKey: ['incidents', params],
    queryFn: () => fetchIncidents(params),
    staleTime: 30_000,
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
