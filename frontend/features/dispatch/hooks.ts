'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchDispatches,
  fetchDispatch,
  createDispatch,
  fetchDispatchRecommendations,
  fetchPriorityRecommendation,
  fetchAvailableUnits,
  fetchDispatchIncidents,
  type CreateDispatchBody,
} from './api';

export function useDispatches(incidentId?: string) {
  return useQuery({
    queryKey: ['dispatches', incidentId],
    queryFn: () => fetchDispatches(incidentId),
    staleTime: 30_000,
  });
}

export function useDispatch(id: string | null) {
  return useQuery({
    queryKey: ['dispatch', id],
    queryFn: () => fetchDispatch(id!),
    enabled: !!id,
  });
}

export function useDispatchRecommendations(incidentId: string | null) {
  return useQuery({
    queryKey: ['dispatch-recommendations', incidentId],
    queryFn: () => fetchDispatchRecommendations(incidentId!),
    enabled: !!incidentId,
    staleTime: 60_000,
  });
}

export function usePriorityRecommendation(incidentId: string | null) {
  return useQuery({
    queryKey: ['priority-recommendation', incidentId],
    queryFn: () => fetchPriorityRecommendation(incidentId!),
    enabled: !!incidentId,
    staleTime: 60_000,
  });
}

export function useAvailableUnits() {
  return useQuery({
    queryKey: ['available-units'],
    queryFn: fetchAvailableUnits,
    staleTime: 20_000,
  });
}

/** Ops dispatch queue — all incidents, for the dispatch page. */
export function useDispatchQueue() {
  return useQuery({
    queryKey: ['dispatch-incidents'],
    queryFn: () => fetchDispatchIncidents(100),
    staleTime: 20_000,
    select: (res) => res.data ?? [],
  });
}

export function useCreateDispatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateDispatchBody) => createDispatch(body),
    onSuccess: (_data, body) => {
      qc.invalidateQueries({ queryKey: ['dispatches'] });
      qc.invalidateQueries({ queryKey: ['dispatch-incidents'] });
      qc.invalidateQueries({ queryKey: ['available-units'] });
      qc.invalidateQueries({ queryKey: ['incidents'] });
      qc.invalidateQueries({ queryKey: ['incident', body.incidentId] });
      qc.invalidateQueries({ queryKey: ['dispatch-incident', body.incidentId] });
    },
  });
}
