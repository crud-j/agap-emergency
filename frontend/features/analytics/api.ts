import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AnalyticsOverview {
  total_incidents: number;
  active_incidents: number;
  resolved_today: number;
  avg_response_time_minutes: number | null;
  avg_on_scene_time_minutes: number | null;
  sla_compliance_rate: number | null;
  incidents_by_status: Record<string, number>;
  incidents_by_category: Record<string, number>;
  incidents_by_priority: Record<string, number>;
}

export interface ResponseTimeStat {
  date: string;
  avg_acknowledge_minutes: number | null;
  avg_dispatch_minutes: number | null;
  avg_on_scene_minutes: number | null;
  count: number;
}

export interface VolumeStat {
  label: string;
  count: number;
  percentage: number;
}

export interface SlaStats {
  total: number;
  within_sla: number;
  breached: number;
  compliance_rate: number;
  by_priority: Record<string, { within: number; breached: number }>;
}

export interface AnalyticsParams {
  from?: string;
  to?: string;
  groupBy?: 'day' | 'week' | 'month';
  category?: string;
  barangay?: string;
}

// ─── Fetchers ────────────────────────────────────────────────────────────────

export function fetchAnalyticsOverview(params?: AnalyticsParams): Promise<AnalyticsOverview> {
  const qs = new URLSearchParams();
  if (params?.from)    qs.set('from', params.from);
  if (params?.to)      qs.set('to', params.to);
  if (params?.category) qs.set('category', params.category);
  return api.get(`/analytics/overview?${qs}`, getToken());
}

export function fetchResponseTimes(params?: AnalyticsParams): Promise<ResponseTimeStat[]> {
  const qs = new URLSearchParams();
  if (params?.from)    qs.set('from', params.from);
  if (params?.to)      qs.set('to', params.to);
  if (params?.groupBy) qs.set('groupBy', params.groupBy);
  return api.get(`/analytics/response-times?${qs}`, getToken());
}

export function fetchVolumeByCategory(params?: AnalyticsParams): Promise<VolumeStat[]> {
  const qs = new URLSearchParams();
  if (params?.from) qs.set('from', params.from);
  if (params?.to)   qs.set('to', params.to);
  return api.get(`/analytics/volume/category?${qs}`, getToken());
}

export function fetchVolumeByBarangay(params?: AnalyticsParams): Promise<VolumeStat[]> {
  const qs = new URLSearchParams();
  if (params?.from) qs.set('from', params.from);
  if (params?.to)   qs.set('to', params.to);
  return api.get(`/analytics/volume/barangay?${qs}`, getToken());
}

export function fetchSlaStats(params?: AnalyticsParams): Promise<SlaStats> {
  const qs = new URLSearchParams();
  if (params?.from) qs.set('from', params.from);
  if (params?.to)   qs.set('to', params.to);
  return api.get(`/analytics/sla?${qs}`, getToken());
}
