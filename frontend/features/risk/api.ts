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

export const RISK_LEVELS = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

/**
 * How an area is drawn: a circle around a pin, an approved hotspot's outline, its whole
 * barangay (older areas and whole-barangay flood proposals), or nowhere.
 */
export type RiskAreaShape = 'PIN' | 'OUTLINE' | 'BARANGAY' | 'NONE';

/** Incidents of the area's type inside it (counts only), worked out by the server. */
export interface RiskAreaStats {
  incidents_90d: number;
  incidents_prev_90d: number;
  last_incident_at: string | null;
}

/** What AGAP suggests a Supervisor changes; the Supervisor decides. */
export type RiskAreaHint =
  | { kind: 'RAISE'; suggestedLevel: RiskLevel; incidents: number; windowDays: number }
  | { kind: 'QUIET'; quietDays: number };

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
  shape: RiskAreaShape;
  /** The outline actually drawn and counted (the barangay polygon for BARANGAY); null for NONE. */
  boundary: AreaBoundary | null;
  pin: { lat: number; lng: number; radius_m: number } | null;
  stats: RiskAreaStats;
  hint: RiskAreaHint | null;
  created_at?: string;
  updated_at?: string;
}

export interface RiskAreaInput {
  name: string;
  riskType: string;
  riskLevel: RiskLevel;
  /** The pin (inside Bocaue) and its radius, 50 to 2000 m. Required for a new area. */
  latitude?: number;
  longitude?: number;
  radiusMeters?: number;
  /** null clears it. */
  floodThresholdMeters?: number | null;
  description?: string;
}

/** GET /risk-intelligence/areas/suggest: what the add form fills in from a pin. */
export interface AreaSuggestion {
  insideBocaue: boolean;
  barangay: string | null;
  windowDays: number;
  incidentsByType: Array<{ category: string; count: number }>;
  sameTypeIncidents: number;
  suggestedLevel: RiskLevel;
  suggestedName: string;
}

export interface HotspotCheckStatus {
  lastRun: { at: string; trigger: 'NIGHTLY' | 'MANUAL'; written: number; failed: boolean } | null;
  nextRunAt: string;
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

export function fetchAreaSuggestion(q: { lat: number; lng: number; radius: number; riskType: string }): Promise<AreaSuggestion> {
  const qs = new URLSearchParams({
    lat: String(q.lat),
    lng: String(q.lng),
    radius: String(q.radius),
    riskType: q.riskType,
  });
  return api.get(`/risk-intelligence/areas/suggest?${qs.toString()}`, getToken());
}

export function fetchHotspotStatus(): Promise<HotspotCheckStatus> {
  return api.get('/risk-intelligence/proposals/status', getToken());
}

export function runHotspotCheck(): Promise<HotspotCheckStatus & { written: number }> {
  return api.post('/risk-intelligence/proposals/check', {}, getToken());
}

// ─── Proposed hotspots (AUTOMATION_NEEDS_PLAN Phase 2, C7) ───────────────────

export interface RiskAreaProposal {
  id: string;
  risk_type: string;
  /** null = the cluster's centre is outside every barangay polygon. */
  barangay: string | null;
  incident_count: number;
  window_days: number;
  /** The cluster's outline, or the whole barangay for a flood proposal. */
  boundary: AreaBoundary | null;
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
