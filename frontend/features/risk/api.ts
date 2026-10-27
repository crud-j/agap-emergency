import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';

export interface HeatmapPoint {
  barangay: string | null;
  count: number;
}

export interface RiskArea {
  id: string;
  name: string;
  risk_type: string;
  risk_level: string;
  barangay: string | null;
  /** Prisma Decimal: the API sends it as a string such as "11.50". */
  flood_threshold_meters: number | string | null;
  description: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export const RISK_LEVELS = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export interface RiskAreaInput {
  name: string;
  riskType: string;
  riskLevel: RiskLevel;
  /** '' clears it. */
  barangay?: string;
  /** null clears it. */
  floodThresholdMeters?: number | null;
  description?: string;
}

export type RiskAreaChanges = Partial<RiskAreaInput> & { isActive?: boolean };

export interface RiskPatterns {
  byCategory: Array<{ category: string; _count: { _all: number } }>;
}

export function fetchRiskHeatmap(): Promise<HeatmapPoint[]> {
  return api.get('/risk-intelligence/heatmap', getToken());
}

export function fetchFloodZones(): Promise<RiskArea[]> {
  return api.get('/risk-intelligence/flood-zones', getToken());
}

export function fetchRiskAreas(): Promise<RiskArea[]> {
  return api.get('/risk-intelligence/areas', getToken());
}

export function fetchRiskPatterns(): Promise<RiskPatterns> {
  return api.get('/risk-intelligence/patterns', getToken());
}

// ─── Management (System Administrator, MODULE_GAPS_COMPLETION_PLAN.md Phase 5) ──

export function createRiskArea(body: RiskAreaInput): Promise<RiskArea> {
  return api.post('/risk-intelligence/areas', body, getToken());
}

export function updateRiskArea(id: string, body: RiskAreaChanges): Promise<RiskArea> {
  return api.patch(`/risk-intelligence/areas/${id}`, body, getToken());
}

export function deleteRiskArea(id: string): Promise<{ message: string }> {
  return api.delete(`/risk-intelligence/areas/${id}`, getToken());
}
