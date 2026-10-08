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
}

export interface ActivateSurgeBody {
  reason: string;
  affectedBarangays?: string[];
  massCasualty?: boolean;
}

// ─── Fetchers ────────────────────────────────────────────────────────────────

// Backend returns { active: boolean, surge: surge_incidents | null }
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
  };
}

export function activateSurge(body: ActivateSurgeBody): Promise<SurgeState> {
  return api.post('/disaster-mode/activate', body, getToken());
}

export function deactivateSurge(): Promise<SurgeState> {
  return api.post('/disaster-mode/deactivate', {}, getToken());
}
