'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchAuditLog, fetchAuditEntry, fetchIncidentAudit, type AuditLogParams } from './api';

export function useAuditLog(params?: AuditLogParams) {
  return useQuery({
    queryKey: ['audit-log', params],
    queryFn: () => fetchAuditLog(params),
    staleTime: 30_000,
  });
}

export function useIncidentAudit(incidentId: string | null) {
  return useQuery({
    queryKey: ['audit-incident', incidentId],
    queryFn: () => fetchIncidentAudit(incidentId!),
    enabled: !!incidentId,
    staleTime: 15_000,
  });
}

export function useAuditEntry(id: string | null) {
  return useQuery({
    queryKey: ['audit-entry', id],
    queryFn: () => fetchAuditEntry(id!),
    enabled: !!id,
  });
}
