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

export async function submitAssessment(
  incidentId: string,
  body: SubmitAssessmentInput,
  token: string,
): Promise<{ id: string }> {
  const res = await fetch(`${API_BASE}/v1/incidents/${incidentId}/assessment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `HTTP ${res.status}`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : { id: '' }) as { id: string };
}
