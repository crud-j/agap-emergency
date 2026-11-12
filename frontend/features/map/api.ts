import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';
import type { RouteSnapshot, TransportDestinationView, TransportLeg } from '@agap/shared';

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

/**
 * One unit on an active mission (GET /locations/responders). The backend only
 * returns ACCEPTED dispatches whose incident is still active, one row per
 * dispatch (freshest crew fix). Fields after `responderId` may be missing on
 * rows first seen through a socket patch until the REST seed refetches.
 */
export interface LiveResponderPosition {
  responderId: string;
  responder_name: string | null;
  dispatchId?: string;
  incident_id: string | null;
  incident_status?: string;
  resource_name: string | null;
  call_sign?: string | null;
  resource_type?: string | null;
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
  updated_at: string;
}

/**
 * GET /locations/tracking/:incidentId/latest — one entry per accepted unit on
 * the incident (WP3). Position is null until the crew's first GPS fix. ETA is
 * always an estimate and null when routing is unavailable.
 */
export interface LatestUnitPosition {
  dispatchId: string;
  callSign: string | null;
  unitName: string | null;
  resourceType: string | null;
  /**
   * Always sent by GET …/latest (C5/C17); absent on a unit first seen over the
   * socket. On the hospital leg a reporter who is not crew-confirmed as the
   * patient gets destination, route and position null.
   */
  leg?: TransportLeg;
  destination?: TransportDestinationView | null;
  route?: RouteSnapshot | null;
  position: {
    lat: number;
    lng: number;
    heading: number | null;
    speedKmh: number | null;
    updatedAt: string;
  } | null;
  eta: { seconds: number | null; isEstimate: true; calculatedAt: string | null };
}

export interface MapConfig {
  provider: string;
  styleUrl: string;
  attribution: string;
  staticMapSupported: boolean;
  supports3dBuildings: boolean;
}

// ─── Fetchers ────────────────────────────────────────────────────────────────

export function fetchMapConfig(): Promise<MapConfig> {
  return api.get('/locations/map-config', getToken());
}

export function fetchRiskData(periodDays = 30): Promise<RiskIntelligenceResponse> {
  // Geo risk points for the map overlay (MOD-51). Lives under risk-intelligence —
  // the former /analytics/risk path never existed on the backend (404).
  return api.get(`/risk-intelligence/map-points?periodDays=${periodDays}`, getToken());
}

export function fetchLiveResponderPositions(): Promise<LiveResponderPosition[]> {
  // GET /locations/responders returns the latest position for all active responders.
  return api.get('/locations/responders', getToken());
}

export function fetchLatestUnitPositions(incidentId: string): Promise<LatestUnitPosition[]> {
  return api.get(`/locations/tracking/${incidentId}/latest`, getToken());
}

export interface RouteLineResult {
  distanceMeters: number | null;
  durationSeconds: number | null;
  isEstimate: true;
  /** [lng, lat] pairs */
  geometry?: Array<[number, number]>;
}

/** POST /locations/route — driving route + ETA (labelled estimate); nulls on routing failure. */
export function fetchRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): Promise<RouteLineResult> {
  return api.post(
    '/locations/route',
    { fromLat: from.lat, fromLng: from.lng, toLat: to.lat, toLng: to.lng },
    getToken(),
  );
}

export interface IncidentLocationItem {
  id: string;
  public_reference: string;
  category: string;
  priority: string;
  status: string;
  lat: number | null;
  lng: number | null;
  /** Reporter agreed to show their photo and the incident is active (staff-only). false = neutral pin. */
  reporter_has_photo: boolean;
  reporter_is_guest: boolean | null;
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
    incident_reporters?: { is_guest: boolean } | null;
    reporter_has_photo?: boolean;
  }> }>(`/incidents?${qs}`, getToken());

  return (res.data ?? []).map((inc) => ({
    id: inc.id,
    public_reference: inc.public_reference,
    category: inc.category,
    priority: inc.priority,
    status: inc.status,
    lat: inc.incident_locations?.latitude != null ? Number(inc.incident_locations.latitude) : null,
    lng: inc.incident_locations?.longitude != null ? Number(inc.incident_locations.longitude) : null,
    reporter_has_photo: inc.reporter_has_photo ?? false,
    reporter_is_guest: inc.incident_reporters?.is_guest ?? null,
  }));
}
