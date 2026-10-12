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
  capacity_total: number | null;
  capacity_available: number | null;
  has_emergency_room: boolean | null;
  has_icu: boolean | null;
  blood_bank: boolean | null;
  is_active: boolean;
  facility_capabilities?: FacilityCapability[];
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
}

export interface CreateHospitalBody {
  name: string;
  barangay?: string;
  municipality?: string;
  contactNumber?: string;
  emergencyContact?: string;
  hasEmergencyRoom?: boolean;
  hasIcu?: boolean;
  bloodBank?: boolean;
}

// ─── Fetchers ────────────────────────────────────────────────────────────────
// GET /hospitals and GET /hospitals/:id/referrals return plain arrays (no pagination).

export function fetchHospitals(): Promise<Hospital[]> {
  return api.get('/hospitals', getToken());
}

export function fetchNearbyHospitals(lat: number, lng: number): Promise<Hospital[]> {
  return api.get(`/hospitals/nearby?lat=${lat}&lng=${lng}`, getToken());
}

export function fetchHospital(id: string): Promise<Hospital> {
  return api.get(`/hospitals/${id}`, getToken());
}

export function fetchReferralsForHospital(hospitalId: string): Promise<HospitalReferral[]> {
  return api.get(`/hospitals/${hospitalId}/referrals`, getToken());
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

/** HOSPITAL_USER acknowledges an inbound referral (MOD-38). */
export function acknowledgeReferral(refId: string): Promise<HospitalReferral> {
  return api.patch(`/hospitals/referrals/${refId}/acknowledge`, {}, getToken());
}

/** Mark the referred patient as arrived at the receiving facility. */
export function markReferralArrived(refId: string): Promise<HospitalReferral> {
  return api.patch(`/hospitals/referrals/${refId}/arrived`, {}, getToken());
}
