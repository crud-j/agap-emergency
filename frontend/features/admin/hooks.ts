'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchAdminUsers,
  fetchSystemHealth,
  fetchSystemConfig,
  changeUserRole,
  activateUser,
  deactivateUser,
  deleteUser,
  upsertSystemConfig,
  type AdminUserListParams,
} from './api';

export function useAdminUsers(params?: AdminUserListParams) {
  return useQuery({
    queryKey: ['admin-users', params],
    queryFn: () => fetchAdminUsers(params),
    staleTime: 30_000,
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

export function useSystemConfig() {
  return useQuery({
    queryKey: ['system-config'],
    queryFn: fetchSystemConfig,
    staleTime: 60_000,
  });
}

function useUserMutation(fn: (id: string) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });
}

export function useChangeUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => changeUserRole(id, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });
}

export function useActivateUser() {
  return useUserMutation(activateUser);
}

export function useDeactivateUser() {
  return useUserMutation(deactivateUser);
}

export function useDeleteUser() {
  return useUserMutation(deleteUser);
}

export function useUpsertConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) =>
      upsertSystemConfig(key, value),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['system-config'] }),
  });
}
