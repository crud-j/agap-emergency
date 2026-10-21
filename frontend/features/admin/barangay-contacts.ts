'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';

export type ContactRole = 'PRIMARY' | 'BACKUP' | 'OTHER';

export interface DirectoryContact {
  id: string;
  barangay_id: string;
  phone_e164: string;
  phone_raw: string | null;
  kind: 'MOBILE' | 'LANDLINE';
  can_sms: boolean;
  role: ContactRole;
  label: string | null;
  is_active: boolean;
  is_demo: boolean;
  verified_at: string | null;
  source: string | null;
  updated_at: string;
}

export interface DirectoryBarangay {
  id: string;
  name: string;
  contacts: DirectoryContact[];
}

export interface NewContact {
  barangayId: string;
  phone: string;
  role: ContactRole;
  label?: string;
}

export interface ContactChanges {
  role?: ContactRole;
  label?: string;
  isActive?: boolean;
  verified?: boolean;
  isDemo?: boolean;
}

const KEY = ['barangay-directory'] as const;

/** Phase 6: every barangay with all its numbers (admin only). */
export function useBarangayDirectory() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api.get<DirectoryBarangay[]>('/barangays/contacts', getToken()),
  });
}

function useDirectoryMutation<T>(fn: (input: T) => Promise<DirectoryContact>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    // A change can move another contact too (primary/backup swap): reload the whole list.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      // Dispatchers' incident panels show the same numbers.
      qc.invalidateQueries({ queryKey: ['incident-barangay'] });
    },
  });
}

export function useAddBarangayContact() {
  return useDirectoryMutation((input: NewContact) =>
    api.post<DirectoryContact>('/barangays/contacts', input, getToken()),
  );
}

export function useUpdateBarangayContact() {
  return useDirectoryMutation(({ id, changes }: { id: string; changes: ContactChanges }) =>
    api.patch<DirectoryContact>(`/barangays/contacts/${id}`, changes, getToken()),
  );
}
