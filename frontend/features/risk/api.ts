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
  flood_threshold_meters: number | null;
  description: string | null;
  is_active: boolean;
}

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
