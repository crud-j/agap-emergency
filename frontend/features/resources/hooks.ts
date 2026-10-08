'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchResources,
  fetchResource,
  fetchAvailableResources,
  updateResourceStatus,
  fetchFleet,
  fetchFleetUnit,
  type ResourceListParams,
} from './api';

export function useResources(params?: ResourceListParams) {
  return useQuery({
    queryKey: ['resources', params],
    queryFn: () => fetchResources(params),
    staleTime: 30_000,
  });
}

export function useResource(id: string | null) {
  return useQuery({
    queryKey: ['resource', id],
    queryFn: () => fetchResource(id!),
    enabled: !!id,
  });
}

export function useAvailableResources() {
  return useQuery({
    queryKey: ['available-units'],
    queryFn: fetchAvailableResources,
    staleTime: 20_000,
  });
}

export function useFleet(params?: ResourceListParams) {
  return useQuery({
    queryKey: ['fleet', params],
    queryFn: () => fetchFleet(params),
    staleTime: 20_000,
  });
}

export function useFleetUnit(id: string | null) {
  return useQuery({
    queryKey: ['fleet-unit', id],
    queryFn: () => fetchFleetUnit(id!),
    enabled: !!id,
  });
}

export function useUpdateResourceStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      updateResourceStatus(id, status),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['resources'] });
      qc.invalidateQueries({ queryKey: ['resource', id] });
      qc.invalidateQueries({ queryKey: ['fleet'] });
      qc.invalidateQueries({ queryKey: ['available-units'] });
    },
  });
}
