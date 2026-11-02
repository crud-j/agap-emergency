'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchResources,
  fetchResource,
  fetchAvailableResources,
  createResource,
  updateResource,
  updateResourceStatus,
  fetchFleet,
  fetchFleetUnit,
  fetchCapabilityCatalog,
  addResourceCapability,
  removeResourceCapability,
  verifyResourceCapability,
  type ResourceListParams,
  type CreateResourceBody,
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

export function useAvailableResources(opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['available-units'],
    queryFn: fetchAvailableResources,
    staleTime: 20_000,
    enabled: opts?.enabled ?? true,
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

export function useCreateResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateResourceBody) => createResource(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['resources'] });
      qc.invalidateQueries({ queryKey: ['available-units'] });
    },
  });
}

export function useUpdateResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<CreateResourceBody> }) =>
      updateResource(id, body),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['resources'] });
      qc.invalidateQueries({ queryKey: ['resource', id] });
    },
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

// ─── Capabilities (MOD-29) ────────────────────────────────────────────────────

export function useCapabilityCatalog(opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['capability-catalog'],
    queryFn: fetchCapabilityCatalog,
    staleTime: 5 * 60_000,
    enabled: opts?.enabled ?? true,
  });
}

/** Chips on the registry and fleet board, and the recommender's ranking, all change. */
function useInvalidateCapabilities() {
  const qc = useQueryClient();
  return (resourceId: string) => {
    qc.invalidateQueries({ queryKey: ['resources'] });
    qc.invalidateQueries({ queryKey: ['resource', resourceId] });
    qc.invalidateQueries({ queryKey: ['fleet'] });
    qc.invalidateQueries({ queryKey: ['dispatch-recommendations'] });
  };
}

export function useAddCapability() {
  const invalidate = useInvalidateCapabilities();
  return useMutation({
    mutationFn: ({ resourceId, capabilityId }: { resourceId: string; capabilityId: string }) =>
      addResourceCapability(resourceId, capabilityId),
    onSuccess: (_data, { resourceId }) => invalidate(resourceId),
  });
}

export function useRemoveCapability() {
  const invalidate = useInvalidateCapabilities();
  return useMutation({
    mutationFn: ({ resourceId, capabilityId }: { resourceId: string; capabilityId: string }) =>
      removeResourceCapability(resourceId, capabilityId),
    onSuccess: (_data, { resourceId }) => invalidate(resourceId),
  });
}

export function useVerifyCapability() {
  const invalidate = useInvalidateCapabilities();
  return useMutation({
    mutationFn: ({ resourceId, capabilityId, verified }: { resourceId: string; capabilityId: string; verified: boolean }) =>
      verifyResourceCapability(resourceId, capabilityId, verified),
    onSuccess: (_data, { resourceId }) => invalidate(resourceId),
  });
}
