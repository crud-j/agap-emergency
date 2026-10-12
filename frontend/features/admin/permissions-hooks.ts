'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchPermissions,
  fetchRolePermissions,
  grantPermission,
  revokePermission,
} from './permissions-api';

export function usePermissions() {
  return useQuery({
    queryKey: ['permissions'],
    queryFn: fetchPermissions,
    staleTime: 5 * 60_000, // catalog rarely changes
  });
}

export function useRolePermissions(role: string | null) {
  return useQuery({
    queryKey: ['role-permissions', role],
    queryFn: () => fetchRolePermissions(role!),
    enabled: !!role,
  });
}

export function useGrantPermission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ role, permissionId }: { role: string; permissionId: string }) =>
      grantPermission(role, permissionId),
    onSuccess: (_d, { role }) =>
      qc.invalidateQueries({ queryKey: ['role-permissions', role] }),
  });
}

export function useRevokePermission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ role, permissionId }: { role: string; permissionId: string }) =>
      revokePermission(role, permissionId),
    onSuccess: (_d, { role }) =>
      qc.invalidateQueries({ queryKey: ['role-permissions', role] }),
  });
}
