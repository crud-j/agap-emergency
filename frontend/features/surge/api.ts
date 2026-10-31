import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SurgeState {
  id: string | null;
  is_active: boolean;
  activated_at: string | null;
  deactivated_at: string | null;
  activation_reason: string | null;
  activated_by: string | null;
  active_incident_count: number;
  affected_barangays: string[];
  mass_casualty: boolean;
  /** Rescue trips since the surge was declared, per barangay (plan Phase 4). Empty when inactive. */
  rescue_by_barangay: BarangayRescueTotal[];
}

export interface BarangayRescueTotal {
  /** null: the incident's location has no barangay. */
  barangay: string | null;
  incidents: number;
  trips: number;
  rescued: number;
  /** Sum of each incident's latest still-waiting estimate. */
  stillWaiting: number;
}

export interface ActivateSurgeBody {
  name: string;
  description?: string;
  category: string;
  affectedBarangays?: string[];
  bocaueRiverLevel?: number;
}

export interface TriageTag {
  id: string;
  surge_id: string;
  patient_id: string | null;
  incident_id: string | null;
  triage_color: string;
  triage_notes: string | null;
  tagged_by_id: string;
  tagged_at: string;
}

export interface SurgeResource {
  id: string;
  name: string;
  resource_type: string;
  status: string;
}

// ─── Fetchers ────────────────────────────────────────────────────────────────

interface BackendSurgeStatus {
  active: boolean;
  surge: {
    id: string;
    name: string;
    activated_at: string;
    deactivated_at: string | null;
    activation_reason?: string | null;
    declared_by_id: string;
    affected_barangays: string[];
    bocaue_river_level?: string | null;
  } | null;
  rescueByBarangay?: BarangayRescueTotal[];
}

export async function fetchSurgeState(): Promise<SurgeState> {
  const raw = await api.get<BackendSurgeStatus>('/disaster-mode/status', getToken());
  return {
    id: raw.surge?.id ?? null,
    is_active: raw.active,
    activated_at: raw.surge?.activated_at ?? null,
    deactivated_at: raw.surge?.deactivated_at ?? null,
    activation_reason: raw.surge?.activation_reason ?? raw.surge?.name ?? null,
    activated_by: raw.surge?.declared_by_id ?? null,
    active_incident_count: 0,
    affected_barangays: raw.surge?.affected_barangays ?? [],
    mass_casualty: false,
    rescue_by_barangay: raw.rescueByBarangay ?? [],
  };
}

export function activateSurge(body: ActivateSurgeBody): Promise<unknown> {
  return api.post('/disaster-mode/activate', body, getToken());
}

export function deactivateSurge(surgeId: string): Promise<unknown> {
  return api.post('/disaster-mode/deactivate', { surgeId }, getToken());
}

export function fetchTriageTags(): Promise<TriageTag[]> {
  return api.get('/disaster-mode/triage', getToken());
}

export function fetchSurgeResources(): Promise<SurgeResource[]> {
  return api.get('/disaster-mode/resources', getToken());
}

export function sendSurgeBroadcast(body: { surgeId: string; message: string }): Promise<unknown> {
  return api.post('/disaster-mode/broadcast', body, getToken());
}

// ─── Surge recommendation (AUTOMATION_NEEDS_PLAN Phase 2, C2) ────────────────

export interface SurgeRule {
  id: string;
  rule_key: string;
  window_minutes: number;
  min_incidents: number;
  category: string | null;
  /** geo_regions names; empty = any barangay. */
  barangays: string[];
  is_active: boolean;
  updated_at: string;
}

export interface SurgeRuleChanges {
  windowMinutes?: number;
  minIncidents?: number;
  barangays?: string[];
  isActive?: boolean;
}

export interface RiverLevel {
  meters: number | null;
  recordedAt: string | null;
  criticalMeters: number;
}

/** The `data_payload` of a SURGE_RECOMMENDED in-app notice (see surge-detector.service.ts). */
export interface SurgeRecommendationData {
  ruleKey: string;
  count: number;
  windowMinutes: number;
  category: string | null;
  barangays: string[];
  riverLevelM?: number;
}

export function fetchSurgeRules(): Promise<SurgeRule[]> {
  return api.get('/disaster-mode/rules', getToken());
}

export function updateSurgeRule(id: string, changes: SurgeRuleChanges): Promise<SurgeRule> {
  return api.patch(`/disaster-mode/rules/${id}`, changes, getToken());
}

export function fetchRiverLevel(): Promise<RiverLevel> {
  return api.get('/disaster-mode/river-level', getToken());
}

export function setRiverLevel(meters: number): Promise<RiverLevel> {
  return api.put('/disaster-mode/river-level', { meters }, getToken());
}
