'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchHospitals,
  fetchHospital,
  fetchFacilities,
  fetchFacility,
  fetchHospitalReferrals,
  acceptReferral,
  divertReferral,
} from './api';

export function useHospitals(active?: boolean) {
  return useQuery({
    queryKey: ['hospitals', { active }],
    queryFn: () => fetchHospitals(active),
    staleTime: 60_000,
  });
}

export function useHospital(id: string | null) {
  return useQuery({
    queryKey: ['hospital', id],
    queryFn: () => fetchHospital(id!),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useFacilities() {
  return useQuery({
    queryKey: ['facilities'],
    queryFn: fetchFacilities,
    staleTime: 60_000,
  });
}

export function useFacility(id: string | null) {
  return useQuery({
    queryKey: ['facility', id],
    queryFn: () => fetchFacility(id!),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useHospitalReferrals(params?: {
  incidentId?: string;
  hospitalId?: string;
  status?: string;
}) {
  return useQuery({
    queryKey: ['hospital-referrals', params],
    queryFn: () => fetchHospitalReferrals(params),
    staleTime: 30_000,
  });
}

export function useAcceptReferral() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (referralId: string) => acceptReferral(referralId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hospital-referrals'] }),
  });
}

export function useDivertReferral() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ referralId, reason }: { referralId: string; reason: string }) =>
      divertReferral(referralId, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hospital-referrals'] }),
  });
}
