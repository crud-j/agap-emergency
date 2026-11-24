'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchAdminUsers,
  fetchSystemHealth,
  fetchSystemConfig,
  fetchSmsLog,
  fetchSmsSummary,
  changeUserRole,
  activateUser,
  deactivateUser,
  deleteUser,
  upsertSystemConfig,
  type AdminUserListParams,
  type ConfigListParams,
  type SmsLogParams,
} from './api';

export function useAdminUsers(params?: AdminUserListParams) {
  return useQuery({
    queryKey: ['admin-users', params],
    queryFn: () => fetchAdminUsers(params),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
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

export function useSystemConfig(params: ConfigListParams = {}) {
  return useQuery({
    queryKey: ['system-config', params],
    queryFn: () => fetchSystemConfig(params),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}

/** Outbound SMS log; refreshes every 30 s so new sends show up while the page is open. */
export function useSmsLog(params: SmsLogParams) {
  return useQuery({
    queryKey: ['sms-log', params],
    queryFn: () => fetchSmsLog(params),
    staleTime: 15_000,
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function useSmsSummary() {
  return useQuery({
    queryKey: ['sms-summary'],
    queryFn: fetchSmsSummary,
    staleTime: 15_000,
    refetchInterval: 30_000,
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
