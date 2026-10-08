'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchOrganizations,
  fetchOrganization,
  updateOrganization,
  type UpdateOrganizationBody,
} from './api';

export function useOrganizations(params?: { orgType?: string; page?: number; perPage?: number }) {
  return useQuery({
    queryKey: ['organizations', params],
    queryFn: () => fetchOrganizations(params),
    staleTime: 60_000,
  });
}

export function useOrganization(id: string | null) {
  return useQuery({
    queryKey: ['organization', id],
    queryFn: () => fetchOrganization(id!),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useUpdateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateOrganizationBody }) =>
      updateOrganization(id, body),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['organizations'] });
      qc.invalidateQueries({ queryKey: ['organization', id] });
    },
  });
}
