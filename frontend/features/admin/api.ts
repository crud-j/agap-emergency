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

export type HealthState = 'ok' | 'error';

/** One BullMQ queue's job counts. `status: 'error'` means the counts couldn't be read. */
export interface QueueHealth {
  name: string;
  status: HealthState;
  waiting: number;
  active: number;
  failed: number;
  delayed: number;
}

export interface DatabaseDetails {
  latencyMs: number | null;
  version: string | null;
  postgisVersion: string | null;
  sizeBytes: number | null;
  connections: number | null;
  maxConnections: number | null;
}

export interface RedisDetails {
  latencyMs: number | null;
  version: string | null;
  uptimeSeconds: number | null;
  usedMemoryBytes: number | null;
  /** 0 or null: no limit set. */
  maxMemoryBytes: number | null;
  memoryPolicy: string | null;
  connectedClients: number | null;
  keys: number | null;
}

export interface StorageDetails {
  configured: boolean;
  provider: string;
  localFallback: boolean;
  latencyMs: number | null;
  incidentFiles: number | null;
  incidentFileBytes: number | null;
}

export interface SmsCounts {
  accepted: number;
  failed: number;
  notConfigured: number;
}

/** GET /administration/health: measured values, counts and provider names only (no secrets). */
export interface SystemHealth {
  database: HealthState;
  redis: HealthState;
  /** Older servers don't send storage. */
  storage?: HealthState;
  details?: {
    database: DatabaseDetails;
    redis: RedisDetails;
    storage: StorageDetails;
  };
  queues: QueueHealth[];
  integrations: {
    sms: {
      configured: boolean;
      lastFailure?: { at: string; reason: string };
      last24h?: SmsCounts | null;
      lastAcceptedAt?: string | null;
      inbound24h?: number | null;
    };
    push: { configured: boolean; registeredDevices?: number | null };
    maps: { configured: boolean; tiles: string; routing: string };
  };
  timestamp: string;
  checkDurationMs?: number;
}

export interface SystemConfigEntry {
  id: string;
  config_key: string;
  config_value: unknown;
  description: string | null;
  updated_by_id: string | null;
  updated_by_name: string | null;
  updated_at: string;
  /** From the server's registry of known keys; null for keys it doesn't know. */
  label: string | null;
  value_type: 'number' | 'boolean' | 'string' | null;
  min: number | null;
  max: number | null;
  unit: string | null;
  /** The feature that reads this key; null means stored but not read by any code. */
  read_by: string | null;
}

export interface ConfigListParams {
  page?: number;
  perPage?: number;
  search?: string;
}

export const SMS_KINDS = [
  'OPS_ALERT', 'BARANGAY_ALERT', 'BARANGAY_REPLY', 'SOS_REPLY', 'CONTACT_ALERT',
  'AUTH', 'ID_REVIEW', 'ANNOUNCEMENT', 'NOTIFICATION', 'OTHER',
] as const;
export type SmsKind = (typeof SMS_KINDS)[number];
export const SMS_STATUSES = ['ACCEPTED', 'FAILED', 'NOT_CONFIGURED'] as const;
export type SmsStatus = (typeof SMS_STATUSES)[number];

export interface SmsLogRow {
  id: string;
  kind: SmsKind;
  status: SmsStatus;
  recipientLast4: string | null;
  gatewayStatus: number | null;
  error: string | null;
  attempt: number;
  chars: number;
  durationMs: number | null;
  hasIncident: boolean;
  createdAt: string;
}

export interface SmsLogParams {
  page?: number;
  perPage?: number;
  status?: string;
  kind?: string;
  from?: string;
  to?: string;
}

export interface SmsWindowCounts {
  accepted: number;
  failed: number;
  notConfigured: number;
  total: number;
}

export interface SmsSummary {
  last24h: SmsWindowCounts;
  last7d: SmsWindowCounts;
  byKind7d: Array<{ kind: SmsKind; total: number; failed: number }>;
  daily: Array<{ day: string; accepted: number; failed: number }>;
  inbound24h: number;
  lastAcceptedAt: string | null;
  lastAttemptAt: string | null;
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

function query(params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') qs.set(k, String(v));
  return qs.toString();
}

export function fetchSystemConfig(params: ConfigListParams = {}): Promise<PaginatedResult<SystemConfigEntry>> {
  return api.get(`/administration/config?${query({ ...params })}`, getToken());
}

export function fetchSmsLog(params: SmsLogParams = {}): Promise<PaginatedResult<SmsLogRow>> {
  return api.get(`/administration/sms?${query({ ...params })}`, getToken());
}

export function fetchSmsSummary(): Promise<SmsSummary> {
  return api.get('/administration/sms/summary', getToken());
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
