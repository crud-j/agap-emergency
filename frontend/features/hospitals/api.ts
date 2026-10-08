import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';
import type { PaginatedResult } from '@agap/shared';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Hospital {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  emergency_contact: string | null;
  is_active: boolean;
  latitude: number | null;
  longitude: number | null;
  organization_id: string;
}

export interface Facility {
  id: string;
  name: string;
  facility_type: string;
  address: string | null;
  phone: string | null;
  is_active: boolean;
  latitude: number | null;
  longitude: number | null;
}

export interface HospitalReferral {
  id: string;
  incident_id: string;
  hospital_id: string;
  status: string;
  referral_notes: string | null;
  referred_at: string;
  accepted_at: string | null;
  diverted_at: string | null;
  divert_reason: string | null;
  hospital?: Pick<Hospital, 'id' | 'name'>;
}

// ─── Fetchers ────────────────────────────────────────────────────────────────

export function fetchHospitals(active?: boolean): Promise<PaginatedResult<Hospital>> {
  const qs = active !== undefined ? `?active=${active}` : '';
  return api.get(`/hospitals${qs}`, getToken());
}

export function fetchHospital(id: string): Promise<Hospital> {
  return api.get(`/hospitals/${id}`, getToken());
}

export function fetchFacilities(): Promise<PaginatedResult<Facility>> {
  return api.get('/facilities', getToken());
}

export function fetchFacility(id: string): Promise<Facility> {
  return api.get(`/facilities/${id}`, getToken());
}

export function fetchHospitalReferrals(params?: {
  incidentId?: string;
  hospitalId?: string;
  status?: string;
}): Promise<PaginatedResult<HospitalReferral>> {
  const qs = new URLSearchParams();
  if (params?.incidentId) qs.set('incidentId', params.incidentId);
  if (params?.hospitalId) qs.set('hospitalId', params.hospitalId);
  if (params?.status)     qs.set('status', params.status);
  return api.get(`/hospitals/referrals?${qs}`, getToken());
}

export function acceptReferral(referralId: string): Promise<HospitalReferral> {
  return api.patch(`/hospitals/referrals/${referralId}/accept`, {}, getToken());
}

export function divertReferral(referralId: string, reason: string): Promise<HospitalReferral> {
  return api.patch(`/hospitals/referrals/${referralId}/divert`, { reason }, getToken());
}
