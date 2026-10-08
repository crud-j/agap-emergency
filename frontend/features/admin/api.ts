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
  is_active: boolean;
  organization_id: string | null;
  created_at: string;
  last_login_at: string | null;
}

export interface SystemHealth {
  status: 'ok' | 'degraded' | 'down';
  database: 'ok' | 'error';
  redis: 'ok' | 'error';
  queues: Record<string, { active: number; waiting: number; failed: number }>;
  uptime_seconds: number;
  version: string;
}

export interface AdminUserListParams {
  role?: string;
  organizationId?: string;
  isActive?: boolean;
  search?: string;
  page?: number;
  perPage?: number;
}

export interface UpdateUserBody {
  role?: string;
  isActive?: boolean;
  organizationId?: string | null;
}

// ─── Fetchers ────────────────────────────────────────────────────────────────

export function fetchAdminUsers(params?: AdminUserListParams): Promise<PaginatedResult<AdminUser>> {
  const qs = new URLSearchParams();
  if (params?.role)           qs.set('role', params.role);
  if (params?.organizationId) qs.set('organizationId', params.organizationId);
  if (params?.isActive !== undefined) qs.set('isActive', String(params.isActive));
  if (params?.search)         qs.set('search', params.search);
  if (params?.page)           qs.set('page', String(params.page));
  if (params?.perPage)        qs.set('perPage', String(params.perPage));
  return api.get(`/admin/users?${qs}`, getToken());
}

export function fetchAdminUser(id: string): Promise<AdminUser> {
  return api.get(`/admin/users/${id}`, getToken());
}

export function updateAdminUser(id: string, body: UpdateUserBody): Promise<AdminUser> {
  return api.patch(`/admin/users/${id}`, body, getToken());
}

export function fetchSystemHealth(): Promise<SystemHealth> {
  return api.get('/admin/health', getToken());
}
