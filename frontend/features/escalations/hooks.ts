'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchEscalations,
  fetchEscalation,
  acknowledgeEscalation,
  resolveEscalation,
  type EscalationListParams,
} from './api';

export function useEscalations(params?: EscalationListParams) {
  return useQuery({
    queryKey: ['escalations', params],
    queryFn: () => fetchEscalations(params),
    staleTime: 15_000,
  });
}

export function useEscalation(id: string | null) {
  return useQuery({
    queryKey: ['escalation', id],
    queryFn: () => fetchEscalation(id!),
    enabled: !!id,
  });
}

export function useAcknowledgeEscalation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => acknowledgeEscalation(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['escalations'] });
      qc.invalidateQueries({ queryKey: ['escalation', id] });
    },
  });
}

export function useResolveEscalation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => resolveEscalation(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['escalations'] });
      qc.invalidateQueries({ queryKey: ['escalation', id] });
    },
  });
}
