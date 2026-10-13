import { authedFetch } from './authed-fetch';
import { ApiError } from './http';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export interface EmergencyContact {
  id: string;
  contact_name: string;
  relationship: string | null;
  phone_number: string;
  email: string | null;
  priority_order: number;
  notify_on_alert: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateContactDto {
  contactName: string;
  relationship?: string;
  phoneNumber: string;
  email?: string;
  priorityOrder?: number;
  notifyOnAlert?: boolean;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError((err as any).message ?? `HTTP ${res.status}`, res.status);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function listContacts(): Promise<EmergencyContact[]> {
  return json(await authedFetch(`${API_BASE}/v1/emergency-contacts`));
}

export async function createContact(dto: CreateContactDto): Promise<EmergencyContact> {
  return json(
    await authedFetch(`${API_BASE}/v1/emergency-contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    }),
  );
}

export async function updateContact(
  id: string,
  dto: Partial<CreateContactDto>,
): Promise<EmergencyContact> {
  return json(
    await authedFetch(`${API_BASE}/v1/emergency-contacts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    }),
  );
}

export async function removeContact(id: string): Promise<void> {
  const res = await authedFetch(`${API_BASE}/v1/emergency-contacts/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 204) {
    throw new ApiError(`HTTP ${res.status}`, res.status);
  }
}
