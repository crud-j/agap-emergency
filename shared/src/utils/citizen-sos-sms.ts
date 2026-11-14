/**
 * Citizen SOS by SMS (MOD-17 / MOD-19): the text the phone puts in the messages app
 * when it has no data, and the parser the backend runs on what the Textbee phone receives.
 *
 * `AGAP|<eventId>|<lat>,<lng>|<unix>|<type>|C:<Y|N>|T:<S|K|M>`
 *
 * Same shape as the ops SMS in CLAUDE.md, but field 2 is the report's client event id
 * (a UUID, the idempotency key) instead of an `INC-…` reference: the server has not
 * assigned one yet. That id is what makes the SMS and a later HTTPS resend one incident.
 * `C:N` with `0,0` means no GPS fix. Field 7 (trigger) is optional.
 *
 * Nothing personal: no name, description or medical data travels through the carrier.
 */
import { IncidentType } from '../enums/incident-type.enum';

export type CitizenSosTrigger = 'SOS_BUTTON' | 'SHAKE_GESTURE' | 'MANUAL_REPORT';

export interface CitizenSosSms {
  eventId: string;
  type: IncidentType;
  /** Null when the phone had no GPS fix (`C:N`). */
  coords: { lat: number; lng: number } | null;
  /** When the phone built the message. */
  sentAt: Date;
  /** MANUAL_REPORT when the message has no trigger field. */
  trigger: CitizenSosTrigger;
}

export type CitizenSosParseFailure =
  | 'FIELDS'
  | 'EVENT_ID'
  | 'COORDS'
  | 'TIME'
  | 'TYPE';

export type CitizenSosParseResult =
  | { ok: true; value: CitizenSosSms }
  | { ok: false; reason: CitizenSosParseFailure };

/** Single SMS segment (GSM-7). */
export const CITIZEN_SOS_SMS_MAX = 160;

/** A phone clock may run a little fast; further ahead than this is not a real send time. */
const MAX_CLOCK_SKEW_MS = 10 * 60_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMBER = /^-?\d{1,3}(\.\d{1,7})?$/;

const TRIGGER_CODE: Record<CitizenSosTrigger, string> = {
  SOS_BUTTON: 'S',
  SHAKE_GESTURE: 'K',
  MANUAL_REPORT: 'M',
};
const TRIGGER_BY_CODE: Record<string, CitizenSosTrigger> = { S: 'SOS_BUTTON', K: 'SHAKE_GESTURE', M: 'MANUAL_REPORT' };

const TYPES = new Set<string>(Object.values(IncidentType));

export function encodeCitizenSosSms(input: {
  eventId: string;
  type: IncidentType | string;
  coords: { lat: number; lng: number } | null;
  sentAt: Date;
  trigger: CitizenSosTrigger;
}): string {
  const lat = input.coords ? input.coords.lat.toFixed(5) : '0';
  const lng = input.coords ? input.coords.lng.toFixed(5) : '0';
  const unix = Math.floor(input.sentAt.getTime() / 1000);
  return [
    'AGAP',
    input.eventId,
    `${lat},${lng}`,
    String(unix),
    input.type,
    `C:${input.coords ? 'Y' : 'N'}`,
    `T:${TRIGGER_CODE[input.trigger]}`,
  ].join('|');
}

/**
 * Null when the text is not a citizen SOS at all (a barangay reply, STOP, an ops SMS
 * echoed back): the caller handles it as before. A failure when it starts like one
 * (`AGAP|` + a non-`INC-` field) but cannot be trusted.
 */
export function parseCitizenSosSms(body: string, now: Date = new Date()): CitizenSosParseResult | null {
  const text = body.trim();
  if (!/^AGAP\|/i.test(text)) return null;
  const fields = text.split('|').map((f) => f.trim());
  // An ops alert (`AGAP|INC-…`) is never a citizen report.
  if (/^INC-/i.test(fields[1] ?? '')) return null;

  if (fields.length < 6 || fields.length > 7) return { ok: false, reason: 'FIELDS' };
  const [, eventId = '', coordText = '', unixText = '', typeText = '', coordFlag = '', triggerField] = fields;

  if (!UUID.test(eventId)) return { ok: false, reason: 'EVENT_ID' };

  const type = typeText.toUpperCase();
  if (!TYPES.has(type)) return { ok: false, reason: 'TYPE' };

  if (!/^\d{9,11}$/.test(unixText)) return { ok: false, reason: 'TIME' };
  const sentAt = new Date(Number(unixText) * 1000);
  if (sentAt.getTime() > now.getTime() + MAX_CLOCK_SKEW_MS || sentAt.getTime() < Date.UTC(2020, 0, 1)) {
    return { ok: false, reason: 'TIME' };
  }

  const flag = coordFlag.toUpperCase();
  if (flag !== 'C:Y' && flag !== 'C:N') return { ok: false, reason: 'FIELDS' };
  let coords: CitizenSosSms['coords'] = null;
  if (flag === 'C:Y') {
    const [latText = '', lngText = '', ...rest] = coordText.split(',');
    if (rest.length > 0 || !NUMBER.test(latText) || !NUMBER.test(lngText)) return { ok: false, reason: 'COORDS' };
    const lat = Number(latText);
    const lng = Number(lngText);
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return { ok: false, reason: 'COORDS' };
    coords = { lat, lng };
  }

  let trigger: CitizenSosTrigger = 'MANUAL_REPORT';
  if (triggerField !== undefined) {
    const code = /^T:([A-Z])$/i.exec(triggerField)?.[1]?.toUpperCase();
    const fromCode = code ? TRIGGER_BY_CODE[code] : undefined;
    if (!fromCode) return { ok: false, reason: 'FIELDS' };
    trigger = fromCode;
  }

  // The id exactly as the phone generated it: it must match the HTTPS resend's key.
  return { ok: true, value: { eventId, type: type as IncidentType, coords, sentAt, trigger } };
}
