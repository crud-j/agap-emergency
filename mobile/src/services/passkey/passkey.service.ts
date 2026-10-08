import { NativeModules, Platform } from 'react-native';
import { Passkey } from 'react-native-passkey';
import type {
  PasskeyCreateRequest,
  PasskeyCreateResult,
  PasskeyGetRequest,
  PasskeyGetResult,
} from 'react-native-passkey';

/**
 * Thin wrapper over the native passkey module (Android Credential Manager /
 * iOS AuthenticationServices). The backend generates WebAuthn options with
 * @simplewebauthn/server; this module hands them to the OS and returns the
 * authenticator response in the JSON shape the backend verifies.
 */

export type PasskeyFailure = 'cancelled' | 'unsupported' | 'no-credentials' | 'already-exists' | 'failed';

export class PasskeyError extends Error {
  constructor(readonly reason: PasskeyFailure, message?: string) {
    super(message ?? reason);
    this.name = 'PasskeyError';
  }
}

/** True only on a dev/production build that links the native module (not Expo Go)
 *  and on an OS version with platform passkeys (Android 9+, iOS 15+). */
export function isPasskeySupported(): boolean {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return false;
  if (!NativeModules.Passkey) return false;
  try {
    return Passkey.isSupported();
  } catch {
    return false;
  }
}

function toPasskeyError(e: unknown): PasskeyError {
  const code = (e as { error?: string })?.error;
  switch (code) {
    case 'UserCancelled':
    case 'Interrupted':
      return new PasskeyError('cancelled');
    case 'NotSupported':
      return new PasskeyError('unsupported');
    case 'NoCredentials':
      return new PasskeyError('no-credentials');
    case 'CredentialAlreadyExists':
      return new PasskeyError('already-exists');
    default:
      return new PasskeyError('failed', (e as { message?: string })?.message);
  }
}

// Native results can omit fields that the WebAuthn JSON spec (and the server
// verifier) expects, so fill them in before posting back.
function normalize<T extends PasskeyCreateResult | PasskeyGetResult>(result: T) {
  return {
    ...result,
    rawId: result.rawId ?? result.id,
    type: result.type ?? 'public-key',
    clientExtensionResults: result.clientExtensionResults ?? {},
  };
}

export async function createPasskey(options: unknown) {
  if (!isPasskeySupported()) throw new PasskeyError('unsupported');
  try {
    return normalize(await Passkey.create(options as PasskeyCreateRequest));
  } catch (e) {
    throw toPasskeyError(e);
  }
}

export async function getPasskey(options: unknown) {
  if (!isPasskeySupported()) throw new PasskeyError('unsupported');
  try {
    return normalize(await Passkey.get(options as PasskeyGetRequest));
  } catch (e) {
    throw toPasskeyError(e);
  }
}

/** Friendly default name for a new passkey, e.g. "Pixel 8 (Android)". */
export function defaultDeviceLabel(): string {
  const model = (Platform.constants as { Model?: string }).Model;
  if (Platform.OS === 'android') return model ? `${model} (Android)` : 'Android device';
  if (Platform.OS === 'ios') return 'iPhone';
  return 'Mobile device';
}
