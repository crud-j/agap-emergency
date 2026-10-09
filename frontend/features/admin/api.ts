import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';
import type { PaginatedResult } from '@agap/shared';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  phone_number: string | null;
  role: string;
  status: string;
  created_at: string;
  last_login_at: string | null;
}

export interface SystemHealth {
  database: 'ok' | 'error' | 'unknown';
  redis: 'ok' | 'error' | 'unknown';
  timestamp: string;
}

export interface SystemConfigEntry {
  id: string;
  config_key: string;
  config_value: unknown;
  updated_by_id: string | null;
  updated_at: string;
}

export interface AdminUserListParams {
  role?: string;
  status?: string;
  organizationId?: string;
  search?: string;
  page?: number;
  perPage?: number;
}

// ─── Fetchers ────────────────────────────────────────────────────────────────

export function fetchAdminUsers(params?: AdminUserListParams): Promise<PaginatedResult<AdminUser>> {
  const qs = new URLSearchParams();
  if (params?.role)           qs.set('role', params.role);
  if (params?.status)         qs.set('status', params.status);
  if (params?.organizationId) qs.set('organizationId', params.organizationId);
  if (params?.search)         qs.set('search', params.search);
  if (params?.page)           qs.set('page', String(params.page));
  if (params?.perPage)        qs.set('perPage', String(params.perPage));
  return api.get(`/administration/users?${qs}`, getToken());
}

export function fetchSystemHealth(): Promise<SystemHealth> {
  return api.get('/administration/health', getToken());
}

export function fetchSystemConfig(): Promise<SystemConfigEntry[]> {
  return api.get('/administration/config', getToken());
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function changeUserRole(id: string, role: string): Promise<AdminUser> {
  return api.patch(`/administration/users/${id}/role`, { role }, getToken());
}

export function activateUser(id: string): Promise<AdminUser> {
  return api.patch(`/administration/users/${id}/activate`, {}, getToken());
}

export function deactivateUser(id: string): Promise<AdminUser> {
  return api.patch(`/administration/users/${id}/deactivate`, {}, getToken());
}

export function deleteUser(id: string): Promise<void> {
  return api.delete(`/administration/users/${id}`, getToken());
}

export function upsertSystemConfig(key: string, value: unknown): Promise<SystemConfigEntry> {
  return api.put(`/administration/config/${key}`, { value }, getToken());
}
