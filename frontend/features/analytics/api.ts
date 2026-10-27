import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ResponseTimeGroup {
  category: string;
  _avg: {
    acknowledge_duration_secs: number | null;
    dispatch_duration_secs: number | null;
    response_duration_secs: number | null;
    total_duration_secs: number | null;
  };
  _count: { _all: number };
}

export interface VolumeData {
  byCategory: Array<{ category: string; _count: { _all: number } }>;
  byStatus: Array<{ status: string; _count: { _all: number } }>;
}

export interface SlaComplianceData {
  total: number;
  acknowledgeSlaMet: number;
  dispatchSlaMet: number;
  acknowledgeCompliancePct: number | null;
  dispatchCompliancePct: number | null;
}

export interface FalseAlertRateData {
  totalIncidents: number;
  falseAlerts: number;
  ratePct: number | null;
}

export interface DailySummaryData {
  date: string;
  total: number;
  byCategory: Array<{ category: string; _count: { _all: number } }>;
  byStatus: Array<{ status: string; _count: { _all: number } }>;
}

// ─── Fetchers ────────────────────────────────────────────────────────────────

export interface AnalyticsRange {
  from: string;
  to: string;
}

function rangeQuery(range: AnalyticsRange): string {
  return `?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;
}

export function fetchResponseTimes(range: AnalyticsRange): Promise<ResponseTimeGroup[]> {
  return api.get(`/analytics/response-times${rangeQuery(range)}`, getToken());
}

export function fetchVolume(range: AnalyticsRange): Promise<VolumeData> {
  return api.get(`/analytics/volume${rangeQuery(range)}`, getToken());
}

export function fetchSlaCompliance(range: AnalyticsRange): Promise<SlaComplianceData> {
  return api.get(`/analytics/sla-compliance${rangeQuery(range)}`, getToken());
}

export function fetchFalseAlertRate(range: AnalyticsRange): Promise<FalseAlertRateData> {
  return api.get(`/analytics/false-alert-rate${rangeQuery(range)}`, getToken());
}

export function fetchDailySummary(date?: string): Promise<DailySummaryData> {
  const qs = date ? `?date=${encodeURIComponent(date)}` : '';
  return api.get(`/analytics/daily${qs}`, getToken());
}

/** GET /analytics/municipal-overview: counts only (Office of the Mayor dashboard). */
export interface MunicipalOverview {
  generatedAt: string;
  active: number;
  activeByCategory: Array<{ category: string; count: number }>;
  activeByPriority: Array<{ priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'; count: number }>;
  /** Ranked, largest first; incidents with no tagged barangay are "Unassigned". */
  activeByBarangay: Array<{ barangay: string; count: number }>;
  /** Since Manila midnight. */
  today: { total: number; critical: number; resolved: number };
  yesterday: { total: number; critical: number };
  units: { available: number; deployed: number; unavailable: number };
  /** Seven Manila days, oldest first, zero-filled. */
  trend7d: Array<{ date: string; total: number; critical: number }>;
  /** Averages in seconds over incidents submitted in the last 7 days; null when there is no data. */
  performance7d: {
    acknowledgeSec: number | null;
    dispatchSec: number | null;
    arrivalSec: number | null;
    resolvedShare: number | null;
  };
}

export function fetchMunicipalOverview(): Promise<MunicipalOverview> {
  return api.get('/analytics/municipal-overview', getToken());
}

/** GET /analytics/dispatch-summary (Dispatcher, Supervisor): dashboard counts, counted in the database. */
export interface DispatchSummary {
  generatedAt: string;
  active: number;
  unreviewed: number;
  awaitingDispatch: number;
  critical: number;
  enRoute: number;
  onScene: number;
  /** Rolling 24-hour windows ending now. */
  last24h: { reported: number; critical: number; resolved: number };
  previous24h: { reported: number; critical: number; resolved: number };
  units: MunicipalOverview['units'];
}

export function fetchDispatchSummary(): Promise<DispatchSummary> {
  return api.get('/analytics/dispatch-summary', getToken());
}
