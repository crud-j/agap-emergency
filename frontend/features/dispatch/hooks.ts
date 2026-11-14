'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchDispatches,
  fetchDispatch,
  createDispatch,
  cancelDispatch,
  reassignDispatch,
  fetchDispatchRecommendations,
  fetchPriorityRecommendation,
  fetchAvailableUnits,
  fetchDispatchIncidents,
  fetchIncidentDispatches,
  setIncidentPriority,
  type CreateDispatchBody,
  type DispatchChangeBody,
  type ReassignDispatchBody,
} from './api';

export function useDispatches(incidentId?: string) {
  return useQuery({
    queryKey: ['dispatches', incidentId],
    queryFn: () => fetchDispatches(incidentId),
    staleTime: 30_000,
  });
}

/** Dispatches (unit + crew names) for one incident — the dispatch tracking card. */
export function useIncidentDispatches(incidentId: string | null) {
  return useQuery({
    queryKey: ['incident-dispatches', incidentId],
    queryFn: () => fetchIncidentDispatches(incidentId!),
    enabled: !!incidentId,
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

/** MOD-24 — set the incident's priority (the dispatcher's decision). */
export function useSetIncidentPriority() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ incidentId, priority, notes }: { incidentId: string; priority: string; notes?: string }) =>
      setIncidentPriority(incidentId, priority, notes),
    onSuccess: (_data, { incidentId }) => {
      qc.invalidateQueries({ queryKey: ['incident', incidentId] });
      qc.invalidateQueries({ queryKey: ['incidents'] });
      qc.invalidateQueries({ queryKey: ['priority-recommendation', incidentId] });
    },
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

/** Everything a dispatch, recall or replacement changes for one incident. */
function invalidateDispatchViews(qc: ReturnType<typeof useQueryClient>, incidentId: string) {
  qc.invalidateQueries({ queryKey: ['dispatches'] });
  qc.invalidateQueries({ queryKey: ['dispatch-incidents'] });
  qc.invalidateQueries({ queryKey: ['available-units'] });
  // A unit just sent is no longer AVAILABLE (a recalled one is again); "Dispatch another unit" follows.
  qc.invalidateQueries({ queryKey: ['dispatch-recommendations', incidentId] });
  // The units-needed pre-selection subtracts units already responding.
  qc.invalidateQueries({ queryKey: ['incident-dispatches', incidentId] });
  qc.invalidateQueries({ queryKey: ['responders'] });
  qc.invalidateQueries({ queryKey: ['incidents'] });
  qc.invalidateQueries({ queryKey: ['incident', incidentId] });
  qc.invalidateQueries({ queryKey: ['dispatch-incident', incidentId] });
}

export function useCreateDispatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateDispatchBody) => createDispatch(body),
    // A refusal (e.g. someone else dispatched first) means this view was stale too.
    onSettled: (_data, _err, body) => invalidateDispatchViews(qc, body.incidentId),
  });
}

/** MOD-31 — recall a unit before it reaches the scene. */
export function useCancelDispatch(incidentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dispatchId, body }: { dispatchId: string; body: DispatchChangeBody }) => cancelDispatch(dispatchId, body),
    onSettled: () => invalidateDispatchViews(qc, incidentId),
  });
}

/** MOD-31 — replace a unit before it reaches the scene. */
export function useReassignDispatch(incidentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dispatchId, body }: { dispatchId: string; body: ReassignDispatchBody }) => reassignDispatch(dispatchId, body),
    onSettled: () => invalidateDispatchViews(qc, incidentId),
  });
}
