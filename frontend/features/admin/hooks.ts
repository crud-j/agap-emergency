'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchAdminUsers,
  fetchAdminUser,
  updateAdminUser,
  fetchSystemHealth,
  type AdminUserListParams,
  type UpdateUserBody,
} from './api';

export function useAdminUsers(params?: AdminUserListParams) {
  return useQuery({
    queryKey: ['admin-users', params],
    queryFn: () => fetchAdminUsers(params),
    staleTime: 30_000,
  });
}

export function useAdminUser(id: string | null) {
  return useQuery({
    queryKey: ['admin-user', id],
    queryFn: () => fetchAdminUser(id!),
    enabled: !!id,
  });
}

export function useUpdateAdminUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateUserBody }) =>
      updateAdminUser(id, body),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      qc.invalidateQueries({ queryKey: ['admin-user', id] });
    },
  });
}

export function useSystemHealth() {
  return useQuery({
    queryKey: ['system-health'],
    queryFn: fetchSystemHealth,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
