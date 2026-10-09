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
  acknowledgeCompliancePct: number;
  dispatchCompliancePct: number;
}

export interface FalseAlertRateData {
  totalIncidents: number;
  falseAlerts: number;
  ratePct: number;
}

export interface DailySummaryData {
  date: string;
  total: number;
  byCategory: Array<{ category: string; _count: { _all: number } }>;
  byStatus: Array<{ status: string; _count: { _all: number } }>;
}

// ─── Fetchers ────────────────────────────────────────────────────────────────

export function fetchResponseTimes(): Promise<ResponseTimeGroup[]> {
  return api.get('/analytics/response-times', getToken());
}

export function fetchVolume(): Promise<VolumeData> {
  return api.get('/analytics/volume', getToken());
}

export function fetchSlaCompliance(): Promise<SlaComplianceData> {
  return api.get('/analytics/sla-compliance', getToken());
}

export function fetchFalseAlertRate(): Promise<FalseAlertRateData> {
  return api.get('/analytics/false-alert-rate', getToken());
}

export function fetchDailySummary(date?: string): Promise<DailySummaryData> {
  const qs = date ? `?date=${encodeURIComponent(date)}` : '';
  return api.get(`/analytics/daily${qs}`, getToken());
}
