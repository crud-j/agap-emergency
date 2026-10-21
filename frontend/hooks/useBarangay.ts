import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';

export type BarangaySmsStatus = 'PENDING' | 'SENT' | 'PARTIAL' | 'FAILED' | 'SKIPPED' | 'DISABLED';

export interface BarangayNotice {
  id: string;
  incident_id: string;
  barangay_id: string;
  match_method: 'POLYGON' | 'NEAREST' | 'MANUAL';
  is_approximate: boolean;
  sms_status: BarangaySmsStatus;
  sms_sent_at: string | null;
  closed_at: string | null;
  last_report: string | null;
  last_report_source?: 'LINK' | 'SMS_REPLY' | 'PHONE_CALL' | null;
  last_report_at: string | null;
  followup_due_at: string | null;
  followup_sent_at: string | null;
  barangay: { id: string; name: string };
}

export type BarangayOutcome = 'ON_THE_WAY' | 'HANDLED' | 'NEEDS_BACKUP' | 'NO_ANSWER';

export interface BarangayContact {
  id: string;
  phone_e164: string;
  kind: 'MOBILE' | 'LANDLINE';
  can_sms: boolean;
  role: 'PRIMARY' | 'BACKUP' | 'OTHER';
  label: string | null;
  is_demo: boolean;
  verified_at: string | null;
}

/** A barangay's SMS reply on this case (Phase 5), as stored by the backend. */
export interface BarangaySmsReply {
  id: string;
  body: string;
  received_at: string;
  parsed_command: string | null;
  outcome: string;
}

export interface IncidentBarangay {
  notice: BarangayNotice | null;
  contacts: BarangayContact[];
  /** Newest first. Absent from older backends. */
  smsReplies?: BarangaySmsReply[];
}

export function useIncidentBarangay(incidentId: string | null) {
  return useQuery({
    queryKey: ['incident-barangay', incidentId],
    queryFn: () => api.get<IncidentBarangay>(`/incidents/${incidentId}/barangay`, getToken()),
    enabled: !!incidentId,
    staleTime: 30_000,
  });
}

export function useBarangays() {
  return useQuery({
    queryKey: ['barangays'],
    queryFn: () => api.get<Array<{ id: string; name: string }>>('/barangays', getToken()),
    staleTime: 60 * 60_000,
  });
}

/** Resend the barangay alert SMS after a failure. The server refuses while it is still sending. */
export function useResendBarangayAlert(incidentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<IncidentBarangay>(`/incidents/${incidentId}/barangay/resend`, {}, getToken()),
    onSuccess: (data) => {
      qc.setQueryData(['incident-barangay', incidentId], data);
    },
  });
}

/** Logs the call on the incident timeline. Fire-and-forget: it must never delay the dial. */
export function useLogBarangayCall(incidentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (contactId: string) =>
      api.post<IncidentBarangay>(`/incidents/${incidentId}/barangay/call-attempts`, { contactId }, getToken()),
    // The call is a timeline entry: refresh the drawer so it shows up.
    onSuccess: () => qc.invalidateQueries({ queryKey: ['incident', incidentId] }),
  });
}

/** What the barangay said on the phone. NEEDS_BACKUP also escalates to a supervisor. */
export function useRecordBarangayOutcome(incidentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (outcome: BarangayOutcome) =>
      api.post<IncidentBarangay>(`/incidents/${incidentId}/barangay/outcome`, { outcome }, getToken()),
    onSuccess: (data) => {
      qc.setQueryData(['incident-barangay', incidentId], data);
      qc.invalidateQueries({ queryKey: ['incident', incidentId] });
    },
  });
}

/** ASSESSED → REFERRED with a HANDLED_BY_BARANGAY resolution. The dispatcher closes afterwards. */
export function useConfirmBarangayHandled(incidentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<IncidentBarangay>(`/incidents/${incidentId}/barangay/confirm-handled`, {}, getToken()),
    onSuccess: (data) => {
      qc.setQueryData(['incident-barangay', incidentId], data);
      qc.invalidateQueries({ queryKey: ['incident', incidentId] });
      qc.invalidateQueries({ queryKey: ['incidents'] });
    },
  });
}

export function useSetIncidentBarangay(incidentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (barangayId: string) =>
      api.patch<IncidentBarangay>(`/incidents/${incidentId}/barangay`, { barangayId }, getToken()),
    onSuccess: (data) => {
      qc.setQueryData(['incident-barangay', incidentId], data);
      qc.invalidateQueries({ queryKey: ['incident', incidentId] });
      qc.invalidateQueries({ queryKey: ['incidents'] });
    },
  });
}
