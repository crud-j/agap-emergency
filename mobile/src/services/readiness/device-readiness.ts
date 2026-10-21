import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { Camera } from 'expo-camera';
import { Accelerometer } from 'expo-sensors';
import NetInfo from '@react-native-community/netinfo';
import type { Connectivity, PermissionState, ReportReadinessDto } from '../api/readiness.api';
import type { DeviceSnapshot } from './readiness-rules';

export interface PermissionInfo {
  state: PermissionState;
  /** False once the OS will no longer show the prompt; the user must use Settings. */
  canAskAgain: boolean;
}

export interface DeviceReadiness {
  location: PermissionInfo;
  locationServicesEnabled: boolean;
  notifications: PermissionInfo;
  camera: PermissionInfo;
  motionSensorAvailable: boolean;
  connectivity: Connectivity;
  connectionType: string | null;
  checkedAt: string;
}

const DEVICE_ID_KEY = 'agap_device_id';
const DEVICE_ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
let cachedDeviceId: string | null = null;

/** Random per-install identifier; it is not derived from any hardware or personal data. */
export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  try {
    const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    if (existing) return (cachedDeviceId = existing);
  } catch {
    // Fall through and generate a new identifier.
  }
  const id = Array.from(
    { length: 24 },
    () => DEVICE_ID_ALPHABET[Math.floor(Math.random() * DEVICE_ID_ALPHABET.length)],
  ).join('');
  try {
    await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
  } catch {
    // An unsaved id still works for this session.
  }
  return (cachedDeviceId = id);
}

type PermissionLike = { granted: boolean; status: string; canAskAgain: boolean };

async function readPermission(getter: () => Promise<PermissionLike>): Promise<PermissionInfo> {
  try {
    const response = await getter();
    const state: PermissionState = response.granted
      ? 'GRANTED'
      : response.status === 'denied'
        ? 'DENIED'
        : 'UNDETERMINED';
    return { state, canAskAgain: response.canAskAgain };
  } catch {
    return { state: 'UNAVAILABLE', canAskAgain: false };
  }
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

/** Reads every capability in parallel. Never throws: a failed probe reports as unavailable. */
export async function collectDeviceReadiness(): Promise<DeviceReadiness> {
  const [location, locationServicesEnabled, notifications, camera, motionSensorAvailable, net] =
    await Promise.all([
      readPermission(() => Location.getForegroundPermissionsAsync()),
      safe(() => Location.hasServicesEnabledAsync(), false),
      readPermission(() => Notifications.getPermissionsAsync()),
      readPermission(() => Camera.getCameraPermissionsAsync()),
      safe(() => Accelerometer.isAvailableAsync(), false),
      safe(() => NetInfo.fetch(), null),
    ]);

  let connectivity: Connectivity = 'ONLINE';
  if (!net || net.isConnected === false) connectivity = 'OFFLINE';
  else if (net.isInternetReachable === false) connectivity = 'LIMITED';

  return {
    location,
    locationServicesEnabled,
    notifications,
    camera,
    motionSensorAvailable,
    connectivity,
    connectionType: net?.type ?? null,
    checkedAt: new Date().toISOString(),
  };
}

export function toSnapshot(device: DeviceReadiness): DeviceSnapshot {
  return {
    locationPermission: device.location.state,
    locationServicesEnabled: device.locationServicesEnabled,
    notificationPermission: device.notifications.state,
    cameraPermission: device.camera.state,
    motionSensorAvailable: device.motionSensorAvailable,
    connectivity: device.connectivity,
  };
}

export function toReportDto(device: DeviceReadiness, deviceId: string): ReportReadinessDto {
  const platform = Platform.OS === 'android' || Platform.OS === 'ios' ? Platform.OS : 'web';
  return {
    deviceId,
    platform,
    appVersion: Constants.expoConfig?.version,
    ...toSnapshot(device),
    connectionType: device.connectionType ?? undefined,
    checkedAt: device.checkedAt,
  };
}
