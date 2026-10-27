import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';
import type { PaginatedResult } from '@agap/shared';

// ─── Response types (snake_case — matches Prisma serialization) ──────────────

export interface IncidentLocation {
  latitude: number | null;
  longitude: number | null;
  formatted_address: string | null;
  /** Caller-provided nearest landmark (MOD-09). */
  landmark?: string | null;
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
  trigger_method?: 'SOS_BUTTON' | 'SHAKE_GESTURE' | 'MANUAL_REPORT' | 'DISPATCHER_CREATED' | 'SYSTEM_GENERATED' | null;
  description: string | null;
  number_of_patients: number | null;
  submitted_at: string;
  acknowledged_at: string | null;
  dispatched_at: string | null;
  on_scene_at: string | null;
  resolved_at?: string | null;
  closed_at?: string | null;
  incident_locations: IncidentLocation | null;
  incident_reporters?: { is_guest: boolean; reporter_status?: string | null } | null;
  /** Structured caller intake (MOD-09 / MOD-24). The list endpoint loads only priority_reasons. */
  incident_details?: IncidentIntakeDetails | null;
  /** Reporter map icon, staff-only (WP3.6). PREFER_NOT_TO_SAY / guest / unknown → null. */
  reporter_sex?: 'MALE' | 'FEMALE' | null;
  hazard_flags?: string[];
  /** Barangay tag (ops-only). The list loads the name and last report; the detail loads the full notice. */
  barangay_notices?: Array<{
    is_approximate: boolean;
    last_report: string | null;
    last_report_at: string | null;
    barangay: { id: string; name: string };
  }>;
}

export interface IncidentIntakeDetails {
  /** Intake question key -> option values, validated against the @agap/shared catalog. */
  caller_answers?: Record<string, string[]> | null;
  /** Caller answers that raised the priority at intake. */
  priority_reasons: string[];
}

export interface IncidentReporter {
  reporter_name: string | null;
  reporter_phone: string | null;
  is_guest: boolean;
  /** SAFE (reporting for others) or NEEDS_HELP (reporter is also hurt or in danger). */
  reporter_status?: string | null;
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
  // Tier 1 photo validation (MOD-25) — advisory capture provenance + authenticity.
  capture_timestamp?: string | null;
  capture_source?: string | null;
  authenticity_score?: number | null;
  authenticity_flags?: string[] | null;
  // Tier 2 — advisory AI plausibility review (MOD-10/MOD-25). Null until the
  // async check completes, or forever if OPENAI_API_KEY isn't configured.
  ai_review_label?: 'LIKELY_REAL' | 'SUSPICIOUS' | 'LIKELY_FAKE' | null;
  ai_review_reason?: string | null;
  ai_review_checked_at?: string | null;
  // A dispatcher's manual call that this evidence isn't credible.
  rejected_at?: string | null;
  rejected_by_id?: string | null;
  rejection_notes?: string | null;
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

export interface IncidentTransport {
  id: string;
  incident_id: string;
  dispatch_id: string;
  destination_id: string | null;
  transport_started_at: string | null;
  estimated_arrival_at: string | null;
  arrived_at: string | null;
  destination_changed?: boolean;
  change_reason?: string | null;
  facilities: { id: string; name: string } | null;
}

export interface IncidentListParams {
  status?: string;
  statuses?: string[];
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
  if (params?.statuses?.length) qs.set('statuses', params.statuses.join(','));
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

/** Citizen photo/video bytes, streamed through the API with the dispatcher's token (MOD-10). */
export function fetchAttachmentBlob(incidentId: string, attachmentId: string): Promise<Blob> {
  return api.blob(`/incidents/${incidentId}/attachments/${attachmentId}/file`, getToken());
}

/**
 * Dispatcher rejects a piece of submitted evidence as not credible (MOD-10).
 * Attachment-level only — never changes the incident's status. Warns the reporter.
 */
export function rejectAttachment(
  incidentId: string,
  attachmentId: string,
  notes?: string,
): Promise<IncidentAttachment> {
  return api.patch(`/incidents/${incidentId}/attachments/${attachmentId}/reject`, { notes }, getToken());
}

export function acknowledgeIncident(id: string): Promise<IncidentDetail> {
  return api.patch(`/incidents/${id}/acknowledge`, {}, getToken());
}

export function assessIncident(id: string): Promise<IncidentDetail> {
  return api.patch(`/incidents/${id}/assess`, {}, getToken());
}

export function closeIncident(id: string, notes?: string): Promise<IncidentDetail> {
  return api.post(`/incidents/${id}/close`, { notes }, getToken());
}

// ─── Resolution (MOD-45) ─────────────────────────────────────────────────────

export interface IncidentResolution {
  id: string;
  incident_id: string;
  closed_by_id: string;
  outcome: string;
  patient_disposition: string | null;
  resolution_notes: string | null;
  follow_up_required: boolean;
  follow_up_notes: string | null;
  closed_at: string;
}

export interface CreateResolutionBody {
  outcome: string;
  patientDisposition?: string;
  resolutionNotes?: string;
}

/** The reporter's Verified Reporter standing: counts only. Guests have none. */
export interface ReporterStandingResponse {
  guest: boolean;
  standing: { verifiedReports: number; falseAlerts: number; isVerifiedReporter: boolean } | null;
}

export function fetchReporterStanding(id: string): Promise<ReporterStandingResponse> {
  return api.get(`/incidents/${id}/reporter-standing`, getToken());
}

/** Record the incident outcome + patient disposition (MOD-45). One row per
 *  incident (incident_id is unique); call before closing. Re-sending before the
 *  close updates the row, so a retry after a failed close works. */
export function createResolution(id: string, body: CreateResolutionBody): Promise<IncidentResolution> {
  return api.post(`/incidents/${id}/resolution`, body, getToken());
}

export function fetchResolution(id: string): Promise<IncidentResolution> {
  return api.get(`/incidents/${id}/resolution`, getToken());
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

export function fetchIncidentTransports(incidentId: string): Promise<IncidentTransport[]> {
  return api.get(`/incidents/${incidentId}/transport`, getToken());
}

export function updateIncidentTransport(
  incidentId: string,
  transportId: string,
  body: { destinationId: string; estimatedArrivalAt?: string; changeReason?: string },
): Promise<IncidentTransport> {
  return api.patch(`/incidents/${incidentId}/transport/${transportId}`, body, getToken());
}
