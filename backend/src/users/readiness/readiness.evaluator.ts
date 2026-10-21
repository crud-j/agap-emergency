// MOD-05 — Emergency Readiness and Permission Status.
// Pure classification rules so the server stays the authority on readiness status.
// The mobile app mirrors these rules only for its offline (device-only) fallback.

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

export interface DeviceSnapshot {
  locationPermission: PermissionState;
  locationServicesEnabled: boolean;
  notificationPermission: PermissionState;
  cameraPermission: PermissionState;
  motionSensorAvailable: boolean;
  connectivity: Connectivity;
}

export interface AccountSnapshot {
  pushTokenRegistered: boolean;
  activeEmergencyContacts: number;
  phoneNumber: string | null;
  phoneVerified: boolean;
  hasMedicalProfile: boolean;
  medicalConsentGranted: boolean;
}

function permissionReason(state: PermissionState): string {
  if (state === 'DENIED') return 'PERMISSION_DENIED';
  if (state === 'UNDETERMINED') return 'PERMISSION_UNDETERMINED';
  if (state === 'UNAVAILABLE') return 'UNAVAILABLE';
  return 'OK';
}

/** `account` is optional so the device checks can be evaluated without server data. */
export function evaluateDeviceChecks(
  device: DeviceSnapshot,
  account?: Pick<AccountSnapshot, 'pushTokenRegistered'>,
): ReadinessCheck[] {
  const location: ReadinessCheck =
    device.locationPermission !== 'GRANTED'
      ? { id: 'location', tier: 'ESSENTIAL', status: 'ACTION_NEEDED', reason: permissionReason(device.locationPermission) }
      : device.locationServicesEnabled
        ? { id: 'location', tier: 'ESSENTIAL', status: 'READY', reason: 'OK' }
        : { id: 'location', tier: 'ESSENTIAL', status: 'ACTION_NEEDED', reason: 'SERVICES_OFF' };

  const notifications: ReadinessCheck =
    device.notificationPermission !== 'GRANTED'
      ? { id: 'notifications', tier: 'ESSENTIAL', status: 'ACTION_NEEDED', reason: permissionReason(device.notificationPermission) }
      : account && !account.pushTokenRegistered
        ? { id: 'notifications', tier: 'ESSENTIAL', status: 'LIMITED', reason: 'NOT_REGISTERED' }
        : { id: 'notifications', tier: 'ESSENTIAL', status: 'READY', reason: 'OK' };

  const connectivity: ReadinessCheck = {
    id: 'connectivity',
    tier: 'ESSENTIAL',
    status: device.connectivity === 'ONLINE' ? 'READY' : device.connectivity === 'LIMITED' ? 'LIMITED' : 'ACTION_NEEDED',
    reason: device.connectivity === 'ONLINE' ? 'OK' : device.connectivity,
  };

  const camera: ReadinessCheck = {
    id: 'camera',
    tier: 'OPTIONAL',
    status: device.cameraPermission === 'GRANTED' ? 'READY' : 'LIMITED',
    reason: permissionReason(device.cameraPermission),
  };

  const motion: ReadinessCheck = {
    id: 'motion_sensor',
    tier: 'OPTIONAL',
    status: device.motionSensorAvailable ? 'READY' : 'LIMITED',
    reason: device.motionSensorAvailable ? 'OK' : 'UNAVAILABLE',
  };

  return [location, notifications, connectivity, camera, motion];
}

export function evaluateAccountChecks(account: AccountSnapshot): ReadinessCheck[] {
  const contacts: ReadinessCheck =
    account.activeEmergencyContacts > 0
      ? { id: 'emergency_contacts', tier: 'RECOMMENDED', status: 'READY', reason: 'OK' }
      : { id: 'emergency_contacts', tier: 'RECOMMENDED', status: 'ACTION_NEEDED', reason: 'NONE' };

  const phone: ReadinessCheck = !account.phoneNumber
    ? { id: 'phone_number', tier: 'RECOMMENDED', status: 'ACTION_NEEDED', reason: 'MISSING' }
    : account.phoneVerified
      ? { id: 'phone_number', tier: 'RECOMMENDED', status: 'READY', reason: 'OK' }
      : { id: 'phone_number', tier: 'RECOMMENDED', status: 'LIMITED', reason: 'UNVERIFIED' };

  const medical: ReadinessCheck = !account.medicalConsentGranted
    ? { id: 'medical_profile', tier: 'OPTIONAL', status: 'LIMITED', reason: 'NO_CONSENT' }
    : account.hasMedicalProfile
      ? { id: 'medical_profile', tier: 'OPTIONAL', status: 'READY', reason: 'OK' }
      : { id: 'medical_profile', tier: 'OPTIONAL', status: 'LIMITED', reason: 'NO_PROFILE' };

  return [contacts, phone, medical];
}

/**
 * Optional checks never lower the overall status: a missing photo permission or
 * medical profile must not make a citizen feel they cannot ask for help.
 */
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
