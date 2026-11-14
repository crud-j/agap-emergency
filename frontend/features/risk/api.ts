import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';

/** Barangay or hotspot outline, as PostGIS ST_AsGeoJSON returns it. */
type Ring = [number, number][];
export type AreaBoundary =
  | { type: 'Polygon'; coordinates: Ring[] }
  | { type: 'MultiPolygon'; coordinates: Ring[][] };

/** The Risk Map's time windows (days); the backend accepts only these. */
export const RISK_MAP_PERIODS = [30, 90, 365] as const;
export type RiskMapPeriod = (typeof RISK_MAP_PERIODS)[number];
export const DEFAULT_RISK_MAP_PERIOD: RiskMapPeriod = 90;

export interface RiskMapBarangay {
  name: string;
  boundary: AreaBoundary;
  flood_incidents: number;
}

/** Incidents of one type at one spot (~11 m). Floods appear here only when outside every barangay. */
export interface RiskMapPoint {
  category: string;
  lat: number;
  lng: number;
  incident_count: number;
  last_reported_at: string;
  /** null = outside every barangay boundary. */
  barangay: string | null;
}

export interface RiskMap {
  period_days: RiskMapPeriod;
  generated_at: string;
  barangays: RiskMapBarangay[];
  points: RiskMapPoint[];
  /** true = only the busiest spots were sent. */
  points_truncated: boolean;
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
  /** Set for approved hotspots; null = the area is the whole barangay (or has no place). */
  boundary?: AreaBoundary | null;
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

export function fetchRiskMap(periodDays: RiskMapPeriod): Promise<RiskMap> {
  return api.get(`/risk-intelligence/map?periodDays=${periodDays}`, getToken());
}

export function fetchRiskAreas(): Promise<RiskArea[]> {
  return api.get('/risk-intelligence/areas', getToken());
}

// ─── Management (Supervisor only; read by Dispatchers and, for support, the System Administrator) ──

export function createRiskArea(body: RiskAreaInput): Promise<RiskArea> {
  return api.post('/risk-intelligence/areas', body, getToken());
}

export function updateRiskArea(id: string, body: RiskAreaChanges): Promise<RiskArea> {
  return api.patch(`/risk-intelligence/areas/${id}`, body, getToken());
}

export function deleteRiskArea(id: string): Promise<{ message: string }> {
  return api.delete(`/risk-intelligence/areas/${id}`, getToken());
}

// ─── Proposed hotspots (AUTOMATION_NEEDS_PLAN Phase 2, C7) ───────────────────

export interface RiskAreaProposal {
  id: string;
  risk_type: string;
  /** null = the cluster's centre is outside every barangay polygon. */
  barangay: string | null;
  incident_count: number;
  window_days: number;
  status: 'PENDING' | 'APPROVED' | 'DISMISSED';
  created_at: string;
  updated_at: string;
}

export interface ApproveProposalInput {
  name: string;
  riskLevel: RiskLevel;
  description?: string;
}

export function fetchRiskAreaProposals(): Promise<RiskAreaProposal[]> {
  return api.get('/risk-intelligence/proposals?status=PENDING', getToken());
}

export function approveRiskAreaProposal(id: string, body: ApproveProposalInput): Promise<{ proposalId: string; riskArea: RiskArea }> {
  return api.post(`/risk-intelligence/proposals/${id}/approve`, body, getToken());
}

export function dismissRiskAreaProposal(id: string): Promise<{ proposalId: string; status: 'DISMISSED' }> {
  return api.post(`/risk-intelligence/proposals/${id}/dismiss`, {}, getToken());
}
