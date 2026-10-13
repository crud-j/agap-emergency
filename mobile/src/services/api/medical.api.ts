import { authedFetch } from './authed-fetch';
import { ApiError } from './http';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export interface MedicalProfile {
  id: string;
  blood_type: string | null;
  allergies: string[];
  current_medications: string[];
  medical_conditions: string[];
  disabilities: string[];
  responder_notes: string | null;
  last_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MedicalProfileDto {
  bloodType?: string;
  allergies?: string[];
  currentMedications?: string[];
  medicalConditions?: string[];
  disabilities?: string[];
  responderNotes?: string;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError((err as any).message ?? `HTTP ${res.status}`, res.status);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function getMyMedicalProfile(): Promise<MedicalProfile> {
  return json(await authedFetch(`${API_BASE}/v1/medical-profiles/me`));
}

export async function createMedicalProfile(dto: MedicalProfileDto): Promise<MedicalProfile> {
  return json(
    await authedFetch(`${API_BASE}/v1/medical-profiles/me`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    }),
  );
}

export async function updateMedicalProfile(dto: MedicalProfileDto): Promise<MedicalProfile> {
  return json(
    await authedFetch(`${API_BASE}/v1/medical-profiles/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    }),
  );
}

export async function deleteMedicalProfile(): Promise<void> {
  const res = await authedFetch(`${API_BASE}/v1/medical-profiles/me`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) {
    throw new ApiError(`HTTP ${res.status}`, res.status);
  }
}
