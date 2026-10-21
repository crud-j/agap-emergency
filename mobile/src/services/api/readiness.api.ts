import { authedFetch } from './authed-fetch';
import { ApiError } from './http';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export type PermissionState = 'GRANTED' | 'DENIED' | 'UNDETERMINED' | 'UNAVAILABLE';
export type Connectivity = 'ONLINE' | 'LIMITED' | 'OFFLINE';
export type ReadinessStatus = 'READY' | 'LIMITED' | 'NOT_READY';
export type CheckStatus = 'READY' | 'LIMITED' | 'ACTION_NEEDED';
export type CheckTier = 'ESSENTIAL' | 'RECOMMENDED' | 'OPTIONAL';
export type CheckId =
  | 'location'
  | 'notifications'
  | 'connectivity'
  | 'emergency_contacts'
  | 'phone_number'
  | 'camera'
  | 'motion_sensor'
  | 'medical_profile';

export interface ReadinessCheck {
  id: CheckId;
  tier: CheckTier;
  status: CheckStatus;
  reason: string;
}

export interface ReadinessResult {
  overallStatus: ReadinessStatus | null;
  checks: ReadinessCheck[];
  passed: number;
  total: number;
  deviceId: string | null;
  checkedAt: string | null;
  syncedAt: string | null;
  stale: boolean;
}

export interface ReportReadinessDto {
  deviceId: string;
  platform: 'android' | 'ios' | 'web';
  appVersion?: string;
  locationPermission: PermissionState;
  locationServicesEnabled: boolean;
  notificationPermission: PermissionState;
  cameraPermission: PermissionState;
  motionSensorAvailable: boolean;
  connectivity: Connectivity;
  connectionType?: string;
  checkedAt: string;
}

export async function reportReadiness(dto: ReportReadinessDto): Promise<ReadinessResult> {
  const res = await authedFetch(`${API_BASE}/v1/users/me/readiness`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const message = (err as any).message;
    throw new ApiError(
      Array.isArray(message) ? message.join('\n') : message ?? `HTTP ${res.status}`,
      res.status,
    );
  }
  return res.json();
}
