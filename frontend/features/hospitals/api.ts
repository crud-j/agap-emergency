import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';

// ─── Types ───────────────────────────────────────────────────────────────────
// NOTE: the backend hospitals module is backed by the `facilities` /
// `facility_referrals` Prisma models (facility_type = 'HOSPITAL'). These shapes
// mirror what HospitalsService actually returns — not a separate `hospital` table.

export interface Hospital {
  id: string;
  organization_id: string | null;
  name: string;
  facility_type: string;
  barangay: string | null;
  municipality: string | null;
  province: string | null;
  address: string | null;
  contact_number: string | null;
  emergency_contact: string | null;
  receiving_status: string;
  /** When a receiving status was last reported (C8); null when it never was. */
  receiving_status_updated_at: string | null;
  capacity_total: number | null;
  capacity_available: number | null;
  has_emergency_room: boolean | null;
  has_icu: boolean | null;
  blood_bank: boolean | null;
  is_active: boolean;
  /** JSON numbers (the backend converts Prisma Decimals); null until a location is set. */
  latitude: number | null;
  longitude: number | null;
  location_status: HospitalLocationStatus;
  location_source: string | null;
  last_verified_at: string | null;
  facility_capabilities?: FacilityCapability[];
}

/** facilities.location_status. Only PENDING_REVIEW/REJECTED hospitals are hidden from ambulance crews. */
export type HospitalLocationStatus = 'UNVERIFIED' | 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED';

/** Where a coordinate came from: a hand-placed pin, or a picked "Find location" candidate. */
export type HospitalLocationSource = 'manual' | 'nominatim' | 'manual+osm-crosscheck';

/** POST /hospitals/resolve-location: what staff typed (public facility data only). */
export interface ResolveLocationBody {
  name: string;
  address?: string;
  municipality?: string;
  province?: string;
}

export type ResolveLocationResult = 'AUTO_SELECTABLE' | 'NEEDS_CONFIRMATION' | 'NO_RESULTS' | 'PROVIDER_UNAVAILABLE';

/** One geocoder candidate (HospitalLocationResolverService). Coordinates are the provider's. */
export interface ResolvedCandidate {
  candidateId: string;
  name: string;
  address: string;
  municipality: string | null;
  province: string | null;
  latitude: number;
  longitude: number;
  source: 'nominatim';
  sourceRef: string;
  category: string;
  /** 0–1 */
  score: number;
  reasons: string[];
  /** Id of the facility already registered with this sourceRef, else null. */
  alreadyRegistered: string | null;
}

export interface ResolveLocationResponse {
  normalizedName: string;
  aiAssisted: boolean;
  result: ResolveLocationResult;
  candidates: ResolvedCandidate[];
  /** The top candidate when AUTO_SELECTABLE; null otherwise. */
  selectedCandidateId: string | null;
}

export interface SetHospitalActiveBody {
  isActive: boolean;
  reason?: string;
}

export interface HospitalLocationInput {
  latitude: number;
  longitude: number;
  source: HospitalLocationSource;
  sourceRef?: string;
  confidence?: number;
}

export interface SetHospitalLocationBody extends HospitalLocationInput {
  reason?: string;
}

export interface VerifyHospitalLocationBody {
  decision: 'VERIFIED' | 'REJECTED';
  note?: string;
}

export interface FacilityCapability {
  id: string;
  facility_id: string;
  capability_name: string;
  is_available: boolean;
  notes: string | null;
}

export interface HospitalReferral {
  id: string;
  incident_id: string;
  dispatch_id: string | null;
  facility_id: string;
  patient_id: string | null;
  coordinated_by_id: string | null;
  pre_arrival_notes: string | null;
  eta_minutes: number | null;
  /** PENDING | ACKNOWLEDGED (see facility_referrals.acknowledgment_status). */
  acknowledgment_status: string | null;
  acknowledged_at: string | null;
  patient_arrived_at: string | null;
  created_at: string;
  facilities?: { id: string; name: string };
}

export interface CreateReferralBody {
  incidentId: string;
  dispatchId?: string;
  patientId?: string;
  preArrivalNotes?: string;
  etaMinutes?: number;
}

export interface CreateHospitalBody {
  name: string;
  barangay?: string;
  address?: string;
  municipality?: string;
  province?: string;
  /** Required for an Org Administrator (their own HOSPITAL organization). */
  organizationId?: string;
  location?: HospitalLocationInput;
  contactNumber?: string;
  emergencyContact?: string;
  hasEmergencyRoom?: boolean;
  hasIcu?: boolean;
  bloodBank?: boolean;
}

// ─── Fetchers ────────────────────────────────────────────────────────────────
// GET /hospitals and GET /hospitals/:id/referrals return plain arrays (no pagination).

/**
 * The shared directory hides PENDING_REVIEW and REJECTED hospitals. With
 * `includeUnreviewed`, reviewers get all of them and an Org Administrator also
 * gets their own organization's; other roles get the directory either way.
 * `includeInactive` adds deactivated hospitals, for reviewers only (the registry page).
 */
export function fetchHospitals(opts?: { includeUnreviewed?: boolean; includeInactive?: boolean }): Promise<Hospital[]> {
  const params = new URLSearchParams();
  if (opts?.includeUnreviewed) params.set('includeUnreviewed', 'true');
  if (opts?.includeInactive) params.set('includeInactive', 'true');
  const query = params.toString();
  return api.get(query ? `/hospitals?${query}` : '/hospitals', getToken());
}

export function fetchNearbyHospitals(lat: number, lng: number): Promise<Hospital[]> {
  return api.get(`/hospitals/nearby?lat=${lat}&lng=${lng}`, getToken());
}

export function fetchHospital(id: string): Promise<Hospital> {
  return api.get(`/hospitals/${id}`, getToken());
}

/** One ranked hospital for a referral (C6). A ranking only: the dispatcher picks. */
export interface HospitalRecommendation {
  id: string;
  name: string;
  receivingStatus: string;
  /** The status the score used: a report older than 12 h counts as UNKNOWN. */
  effectiveStatus: string;
  statusAgeHours: number | null;
  hasEmergencyRoom: boolean;
  hasIcu: boolean;
  capacityAvailable: number | null;
  capacityTotal: number | null;
  score: number;
  reasons: string[];
  distanceMeters: number | null;
  distanceLabel: string;
}

/** GET /hospitals/recommendations?incidentId= (Dispatcher, Supervisor). Best first, at most 10. */
export function fetchHospitalRecommendations(incidentId: string): Promise<HospitalRecommendation[]> {
  return api.get(`/hospitals/recommendations?incidentId=${incidentId}`, getToken());
}

/** A receiving status / beds report (C8): what PATCH /facilities/:id/status takes. */
export interface FacilityStatusBody {
  receivingStatus?: string;
  capacityAvailable?: number;
}

/** Dispatcher/Supervisor for any facility; a Hospital User for their own organization's. */
export function updateFacilityStatus(id: string, body: FacilityStatusBody): Promise<unknown> {
  return api.patch(`/facilities/${id}/status`, body, getToken());
}

export function fetchReferralsForHospital(hospitalId: string): Promise<HospitalReferral[]> {
  return api.get(`/hospitals/${hospitalId}/referrals`, getToken());
}

export function fetchReferralsForIncident(incidentId: string): Promise<HospitalReferral[]> {
  return api.get(`/hospitals/referrals/incident/${incidentId}`, getToken());
}

export function fetchReferral(refId: string): Promise<HospitalReferral> {
  return api.get(`/hospitals/referrals/${refId}`, getToken());
}

// ─── Mutations ─────────────────────────────────────────────────────────────────

export function createHospital(body: CreateHospitalBody): Promise<Hospital> {
  return api.post('/hospitals', body, getToken());
}

export function updateHospital(id: string, body: Partial<CreateHospitalBody>): Promise<Hospital> {
  return api.patch(`/hospitals/${id}`, body, getToken());
}

/** System Admin / Supervisor → VERIFIED; Org Administrator (own org) → PENDING_REVIEW. */
export function setHospitalLocation(id: string, body: SetHospitalLocationBody): Promise<Hospital> {
  return api.patch(`/hospitals/${id}/location`, body, getToken());
}

/** Supervisor / System Admin only. VERIFIED needs coordinates (422 LOCATION_MISSING otherwise). */
export function verifyHospitalLocation(id: string, body: VerifyHospitalLocationBody): Promise<Hospital> {
  return api.post(`/hospitals/${id}/location/verify`, body, getToken());
}

/**
 * "Find location": scored map candidates for a typed hospital. Only on an explicit
 * click (Nominatim policy, no autocomplete). A geocoder outage is a 200 PROVIDER_UNAVAILABLE.
 */
export function resolveHospitalLocation(body: ResolveLocationBody): Promise<ResolveLocationResponse> {
  return api.post('/hospitals/resolve-location', body, getToken());
}

/** Supervisor / System Admin. Open transports continue; their crews and the console are warned. */
export function setHospitalActive(id: string, body: SetHospitalActiveBody): Promise<Hospital> {
  return api.patch(`/hospitals/${id}/active`, body, getToken());
}

export function createReferral(hospitalId: string, body: CreateReferralBody): Promise<HospitalReferral> {
  return api.post(`/hospitals/${hospitalId}/referrals`, body, getToken());
}

/** HOSPITAL_USER acknowledges an inbound referral (MOD-38). */
export function acknowledgeReferral(refId: string): Promise<HospitalReferral> {
  return api.patch(`/hospitals/referrals/${refId}/acknowledge`, {}, getToken());
}

/** Mark the referred patient as arrived at the receiving facility. */
export function markReferralArrived(refId: string): Promise<HospitalReferral> {
  return api.patch(`/hospitals/referrals/${refId}/arrived`, {}, getToken());
}

/**
 * GET /facilities: every active facility (hospitals, evacuation centers, health
 * centers…). Dispatcher and Supervisor only. Same `facilities` row as Hospital.
 */
export function fetchFacilities(): Promise<Hospital[]> {
  return api.get('/facilities', getToken());
}
