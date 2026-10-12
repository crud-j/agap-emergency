'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchHospitals,
  fetchHospital,
  fetchNearbyHospitals,
  fetchReferralsForHospital,
  createHospital,
  updateHospital,
  acknowledgeReferral,
  markReferralArrived,
  type CreateHospitalBody,
} from './api';

export function useHospitals() {
  return useQuery({
    queryKey: ['hospitals'],
    queryFn: fetchHospitals,
    staleTime: 30_000,
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

export function useAcknowledgeReferral() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (refId: string) => acknowledgeReferral(refId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hospital-referrals'] }),
  });
}

export function useMarkReferralArrived() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (refId: string) => markReferralArrived(refId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hospital-referrals'] }),
  });
}
