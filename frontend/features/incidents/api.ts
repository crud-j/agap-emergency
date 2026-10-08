import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';
import type { PaginatedResult } from '@agap/shared';

// ─── Response types (snake_case — matches Prisma serialization) ──────────────

export interface IncidentLocation {
  latitude: number | null;
  longitude: number | null;
  formatted_address: string | null;
  barangay: string | null;
  municipality: string | null;
  province: string | null;
}

export interface IncidentListItem {
  id: string;
  public_reference: string;
  category: string;
  priority: string;
  status: string;
  description: string | null;
  number_of_patients: number | null;
  submitted_at: string;
  acknowledged_at: string | null;
  dispatched_at: string | null;
  on_scene_at: string | null;
  incident_locations: IncidentLocation | null;
}

export interface IncidentReporter {
  reporter_name: string | null;
  reporter_phone: string | null;
  is_guest: boolean;
}

export interface IncidentPatient {
  id: string;
  patient_name: string | null;
  approximate_age: number | null;
  sex: string | null;
  is_unknown: boolean;
}

/** On-scene assessment row (MOD-37) — mirrors on_scene_assessments columns. */
export interface IncidentAssessment {
  id: string;
  consciousness_state: string | null;
  breathing_status: string | null;
  blood_pressure_sys: number | null;
  blood_pressure_dia: number | null;
  pulse_bpm: number | null;
  respiratory_rate: number | null;
  temperature_celsius: string | number | null;
  oxygen_saturation: number | null;
  gcs_score: number | null;
  visible_injuries: string[];
  interventions: string[];
  triage_tag: string | null;
  assessment_notes: string | null;
  assessed_at: string;
}

export interface IncidentEvent {
  id: string;
  from_status: string | null;
  to_status: string;
  triggered_by_role: string | null;
  notes: string | null;
  occurred_at: string;
}

export interface IncidentAttachment {
  id: string;
  file_name: string;
  file_type: string;
  storage_url: string | null;
  uploaded_at: string;
}

export interface IncidentDetail extends IncidentListItem {
  incident_reporters: IncidentReporter | null;
  incident_patients: IncidentPatient[];
  dispatches: Array<{ id: string; status: string; resource_id: string }>;
  duplicate_of_id: string | null;
  // Included by GET /incidents/:id (backend findById): timeline + media + assessments in one fetch.
  incident_events?: IncidentEvent[];
  incident_attachments?: IncidentAttachment[];
  on_scene_assessments?: IncidentAssessment[];
}

export interface IncidentListParams {
  status?: string;
  category?: string;
  priority?: string;
  barangay?: string;
  search?: string;
  page?: number;
  perPage?: number;
}

export interface SubmitAssessmentBody {
  consciousnessState?: string;
  breathingStatus?: string;
  vitals?: Record<string, unknown>;
  notes?: string;
  numberOfPatients?: number;
}

// ─── Fetchers ────────────────────────────────────────────────────────────────

export function fetchIncidents(params?: IncidentListParams): Promise<PaginatedResult<IncidentListItem>> {
  const qs = new URLSearchParams();
  if (params?.status)    qs.set('status', params.status);
  if (params?.category)  qs.set('category', params.category);
  if (params?.priority)  qs.set('priority', params.priority);
  if (params?.barangay)  qs.set('barangay', params.barangay);
  if (params?.search)    qs.set('search', params.search);
  if (params?.page)      qs.set('page', String(params.page));
  if (params?.perPage)   qs.set('perPage', String(params.perPage));
  return api.get(`/incidents?${qs}`, getToken());
}

export function fetchIncident(id: string): Promise<IncidentDetail> {
  return api.get(`/incidents/${id}`, getToken());
}

export function acknowledgeIncident(id: string): Promise<IncidentDetail> {
  return api.patch(`/incidents/${id}/acknowledge`, {}, getToken());
}

export function assessIncident(id: string): Promise<IncidentDetail> {
  return api.patch(`/incidents/${id}/assess`, {}, getToken());
}

export function closeIncident(id: string, notes?: string): Promise<IncidentDetail> {
  return api.patch(`/incidents/${id}/close`, { notes }, getToken());
}

export function cancelIncident(id: string, reason: string): Promise<IncidentDetail> {
  return api.patch(`/incidents/${id}/cancel`, { reason }, getToken());
}

export function markFalseAlert(id: string, notes?: string): Promise<IncidentDetail> {
  // Backend: POST /incidents/:id/false-alert (MOD-08) — records a false_alerts
  // row, transitions to FALSE_ALERT, audits, and emits.
  return api.post(`/incidents/${id}/false-alert`, { notes }, getToken());
}

/**
 * Canonical lifecycle transition (MOD-15). PATCH /incidents/:id/status validates
 * the transition, stamps the milestone timestamp, audits, and emits
 * incident.status_changed. Used by the ops detail Drawer status actions.
 */
export function updateIncidentStatus(
  id: string,
  status: string,
  reason?: string,
): Promise<IncidentDetail> {
  return api.patch(`/incidents/${id}/status`, { status, reason }, getToken());
}

export function mergeIncident(id: string, masterIncidentId: string): Promise<IncidentDetail> {
  // Backend: POST /incidents/:id/duplicate (MOD-26) — marks this incident a
  // DUPLICATE of the master. Advisory merge, human-confirmed.
  return api.post(`/incidents/${id}/duplicate`, { masterIncidentId }, getToken());
}

export function submitAssessment(incidentId: string, body: SubmitAssessmentBody): Promise<IncidentAssessment> {
  return api.post(`/incidents/${incidentId}/assessment`, body, getToken());
}
