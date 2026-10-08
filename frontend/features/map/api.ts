import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RiskDataPoint {
  lat: number;
  lng: number;
  intensity: number;
  category: string | null;
  barangay: string | null;
  incident_count: number;
}

export interface RiskIntelligenceResponse {
  points: RiskDataPoint[];
  generated_at: string;
  period_days: number;
}

export interface LiveResponderPosition {
  responderId: string;
  responder_name: string | null;
  resource_name: string | null;
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
  status: string;
  incident_id: string | null;
  updated_at: string;
}

// ─── Fetchers ────────────────────────────────────────────────────────────────

export function fetchRiskData(periodDays = 30): Promise<RiskIntelligenceResponse> {
  return api.get(`/analytics/risk?periodDays=${periodDays}`, getToken());
}

export function fetchLiveResponderPositions(): Promise<LiveResponderPosition[]> {
  // GET /locations/responders returns the latest position for all active responders.
  return api.get('/locations/responders', getToken());
}

export interface IncidentLocationItem {
  id: string;
  public_reference: string;
  category: string;
  priority: string;
  status: string;
  lat: number | null;
  lng: number | null;
}

export async function fetchIncidentLocations(params?: {
  status?: string;
  category?: string;
}): Promise<IncidentLocationItem[]> {
  // There is no dedicated /locations/incidents route. Derive from /incidents which
  // already includes incident_locations in its response (added in findAll).
  const qs = new URLSearchParams({ perPage: '200' });
  if (params?.status)   qs.set('status', params.status);
  if (params?.category) qs.set('category', params.category);

  const res = await api.get<{ data: Array<{
    id: string;
    public_reference: string;
    category: string;
    priority: string;
    status: string;
    incident_locations: { latitude: number | string | null; longitude: number | string | null } | null;
  }> }>(`/incidents?${qs}`, getToken());

  return (res.data ?? []).map((inc) => ({
    id: inc.id,
    public_reference: inc.public_reference,
    category: inc.category,
    priority: inc.priority,
    status: inc.status,
    lat: inc.incident_locations?.latitude != null ? Number(inc.incident_locations.latitude) : null,
    lng: inc.incident_locations?.longitude != null ? Number(inc.incident_locations.longitude) : null,
  }));
}
