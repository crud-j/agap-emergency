'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchHospitals,
  fetchHospital,
  fetchFacilities,
  fetchNearbyHospitals,
  fetchReferralsForHospital,
  createHospital,
  updateHospital,
  acknowledgeReferral,
  markReferralArrived,
  fetchReferralsForIncident,
  createReferral,
  setHospitalLocation,
  verifyHospitalLocation,
  type CreateHospitalBody,
  type CreateReferralBody,
  type SetHospitalLocationBody,
  type VerifyHospitalLocationBody,
} from './api';

/** Pickers keep the default (reviewed hospitals only); the registry page asks for unreviewed ones too. */
export function useHospitals(opts?: { includeUnreviewed?: boolean; enabled?: boolean }) {
  const includeUnreviewed = opts?.includeUnreviewed ?? false;
  return useQuery({
    queryKey: includeUnreviewed ? ['hospitals', 'with-unreviewed'] : ['hospitals'],
    queryFn: () => fetchHospitals({ includeUnreviewed }),
    staleTime: 30_000,
    enabled: opts?.enabled ?? true,
  });
}

export function useFacilities(opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['facilities'],
    queryFn: fetchFacilities,
    staleTime: 60_000,
    enabled: opts?.enabled ?? true,
  });
}

export function useHospital(id: string | null) {
  return useQuery({
    queryKey: ['hospital', id],
    queryFn: () => fetchHospital(id!),
    enabled: !!id,
  });
}

export function useNearbyHospitals(lat: number | null, lng: number | null) {
  return useQuery({
    queryKey: ['hospitals', 'nearby', lat, lng],
    queryFn: () => fetchNearbyHospitals(lat!, lng!),
    enabled: lat != null && lng != null,
  });
}

export function useHospitalReferrals(hospitalId: string | null) {
  return useQuery({
    queryKey: ['hospital-referrals', hospitalId],
    queryFn: () => fetchReferralsForHospital(hospitalId!),
    enabled: !!hospitalId,
    refetchInterval: 20_000,
  });
}

export function useIncidentReferrals(incidentId: string | null) {
  return useQuery({
    queryKey: ['incident-referrals', incidentId],
    queryFn: () => fetchReferralsForIncident(incidentId!),
    enabled: !!incidentId,
    refetchInterval: 20_000,
  });
}

export function useCreateReferral() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ hospitalId, body }: { hospitalId: string; body: CreateReferralBody }) =>
      createReferral(hospitalId, body),
    onSuccess: (_data, { hospitalId, body }) => {
      qc.invalidateQueries({ queryKey: ['incident-referrals', body.incidentId] });
      qc.invalidateQueries({ queryKey: ['hospital-referrals', hospitalId] });
    },
  });
}

export function useCreateHospital() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateHospitalBody) => createHospital(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hospitals'] }),
  });
}

export function useUpdateHospital() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<CreateHospitalBody> }) =>
      updateHospital(id, body),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ['hospitals'] });
      qc.invalidateQueries({ queryKey: ['hospital', id] });
    },
  });
}

/** Invalidates every hospitals list (the directory, nearby and with-unreviewed all start with 'hospitals'). */
export function useSetHospitalLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: SetHospitalLocationBody }) => setHospitalLocation(id, body),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ['hospitals'] });
      qc.invalidateQueries({ queryKey: ['hospital', id] });
    },
  });
}

export function useVerifyHospitalLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: VerifyHospitalLocationBody }) => verifyHospitalLocation(id, body),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ['hospitals'] });
      qc.invalidateQueries({ queryKey: ['hospital', id] });
    },
  });
}

export function useAcknowledgeReferral() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (refId: string) => acknowledgeReferral(refId),
    onSuccess: (referral) => {
      qc.invalidateQueries({ queryKey: ['hospital-referrals'] });
      qc.invalidateQueries({ queryKey: ['incident-referrals', referral.incident_id] });
    },
  });
}

export function useMarkReferralArrived() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (refId: string) => markReferralArrived(refId),
    onSuccess: (referral) => {
      qc.invalidateQueries({ queryKey: ['hospital-referrals'] });
      qc.invalidateQueries({ queryKey: ['incident-referrals', referral.incident_id] });
    },
  });
}
