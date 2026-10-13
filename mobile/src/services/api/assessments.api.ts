import { apiFetch } from './http';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export interface AssessmentVitals {
  bloodPressureSys?: number;
  bloodPressureDia?: number;
  pulseBpm?: number;
  respiratoryRate?: number;
  temperatureCelsius?: number;
  oxygenSaturation?: number;
  gcsScore?: number;
}

/** On-scene assessment payload (MOD-37). Every field optional — never blocks submission. */
export interface SubmitAssessmentInput {
  consciousnessState?: string;
  breathingStatus?: string;
  vitals?: AssessmentVitals;
  numberOfPatients?: number;
  notes?: string;
  visibleInjuries?: string[];
  interventions?: string[];
  triageTag?: string;
}

export function submitAssessment(
  incidentId: string,
  body: SubmitAssessmentInput,
  token: string,
): Promise<{ id: string }> {
  return apiFetch(`${API_BASE}/v1/incidents/${incidentId}/assessment`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}
