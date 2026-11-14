/**
 * Citizen SOS by SMS (MOD-17 / MOD-19): when the report cannot go over data, the app opens
 * the messages app with one `AGAP|<eventId>|<lat>,<lng>|<unix>|<type>|C:Y|T:S` text to the
 * AGAP SMS number, and the citizen presses Send. iOS cannot send an SMS silently, and on
 * Android that needs SEND_SMS, which Play allows only for default SMS apps.
 *
 * The event id is the report's idempotency key, so the SMS, a resend, and the app's own
 * retry when data returns are all the same incident on the server.
 */
import { Linking, Platform } from 'react-native';
import { encodeCitizenSosSms, type IncidentType } from '@agap/shared';
import { ApiError } from '@/src/services/api/http';

export interface SosSmsDraft {
  idempotencyKey: string | null;
  type: IncidentType | null;
  triggerMethod: 'SOS_BUTTON' | 'SHAKE_GESTURE' | 'MANUAL_REPORT';
  location: { lat: number; lng: number } | null;
}

/** The text to send, or null when the draft has no event id or type yet. No personal data. */
export function buildSosSmsBody(draft: SosSmsDraft, now: Date = new Date()): string | null {
  if (!draft.idempotencyKey || !draft.type) return null;
  return encodeCitizenSosSms({
    eventId: draft.idempotencyKey,
    type: draft.type,
    coords: draft.location ? { lat: draft.location.lat, lng: draft.location.lng } : null,
    sentAt: now,
    trigger: draft.triggerMethod,
  });
}

/** `sms:` link with the text filled in. iOS reads `&body=`, Android `?body=`. */
export function sosSmsUrl(number: string, body: string, os: string = Platform.OS): string {
  return `sms:${number}${os === 'ios' ? '&' : '?'}body=${encodeURIComponent(body)}`;
}

/**
 * Opens the messages app. False when no app took the link: the screen then points to the
 * hotlines. No canOpenURL check: on Android it needs a <queries> entry (a native rebuild).
 */
export async function openSosSms(number: string, body: string): Promise<boolean> {
  try {
    await Linking.openURL(sosSmsUrl(number, body));
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether a failed send is a connection problem SMS can get around: no network, a timeout
 * or a server error. A refusal (4xx, e.g. the guest report limit) is not: SMS would be
 * refused too, so the screen shows the hotlines.
 */
export function smsCanHelp(err: unknown): boolean {
  if (!(err instanceof ApiError)) return true;
  return err.status === 408 || err.status >= 500;
}
