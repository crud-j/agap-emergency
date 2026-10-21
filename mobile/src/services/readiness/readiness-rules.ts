import type {
  CheckId,
  CheckTier,
  Connectivity,
  PermissionState,
  ReadinessCheck,
  ReadinessStatus,
} from '../api/readiness.api';

// Offline fallback only: mirrors backend/src/users/readiness/readiness.evaluator.ts,
// which stays the authority whenever the server can be reached.

export const ACCOUNT_CHECK_IDS: CheckId[] = ['emergency_contacts', 'phone_number', 'medical_profile'];

export interface DeviceSnapshot {
  locationPermission: PermissionState;
  locationServicesEnabled: boolean;
  notificationPermission: PermissionState;
  cameraPermission: PermissionState;
  motionSensorAvailable: boolean;
  connectivity: Connectivity;
}

function permissionReason(state: PermissionState): string {
  if (state === 'DENIED') return 'PERMISSION_DENIED';
  if (state === 'UNDETERMINED') return 'PERMISSION_UNDETERMINED';
  if (state === 'UNAVAILABLE') return 'UNAVAILABLE';
  return 'OK';
}

export function evaluateDeviceChecks(device: DeviceSnapshot): ReadinessCheck[] {
  const location: ReadinessCheck =
    device.locationPermission !== 'GRANTED'
      ? { id: 'location', tier: 'ESSENTIAL', status: 'ACTION_NEEDED', reason: permissionReason(device.locationPermission) }
      : device.locationServicesEnabled
        ? { id: 'location', tier: 'ESSENTIAL', status: 'READY', reason: 'OK' }
        : { id: 'location', tier: 'ESSENTIAL', status: 'ACTION_NEEDED', reason: 'SERVICES_OFF' };

  return [
    location,
    {
      id: 'notifications',
      tier: 'ESSENTIAL',
      status: device.notificationPermission === 'GRANTED' ? 'READY' : 'ACTION_NEEDED',
      reason: permissionReason(device.notificationPermission),
    },
    {
      id: 'connectivity',
      tier: 'ESSENTIAL',
      status: device.connectivity === 'ONLINE' ? 'READY' : device.connectivity === 'LIMITED' ? 'LIMITED' : 'ACTION_NEEDED',
      reason: device.connectivity === 'ONLINE' ? 'OK' : device.connectivity,
    },
    {
      id: 'camera',
      tier: 'OPTIONAL',
      status: device.cameraPermission === 'GRANTED' ? 'READY' : 'LIMITED',
      reason: permissionReason(device.cameraPermission),
    },
    {
      id: 'motion_sensor',
      tier: 'OPTIONAL',
      status: device.motionSensorAvailable ? 'READY' : 'LIMITED',
      reason: device.motionSensorAvailable ? 'OK' : 'UNAVAILABLE',
    },
  ];
}

export function overallStatus(checks: ReadinessCheck[]): ReadinessStatus {
  if (checks.some((check) => check.tier === 'ESSENTIAL' && check.status === 'ACTION_NEEDED')) {
    return 'NOT_READY';
  }
  if (checks.some((check) => check.tier !== 'OPTIONAL' && check.status !== 'READY')) {
    return 'LIMITED';
  }
  return 'READY';
}

const TIER_ORDER: Record<CheckTier, number> = { ESSENTIAL: 0, RECOMMENDED: 1, OPTIONAL: 2 };

export function sortChecks(checks: ReadinessCheck[]): ReadinessCheck[] {
  return [...checks].sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]);
}
