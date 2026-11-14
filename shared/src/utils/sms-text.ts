/**
 * Helpers for SMS texts people read. Every AGAP text must stay one segment: 160 GSM-7
 * characters. One character outside GSM-7 (an em dash, curly quote or "…", common in text
 * typed on a phone or pasted from a document) switches the whole text to UCS-2, where one
 * segment holds only 70 characters, so the text splits or is cut.
 */
import { IncidentType } from '../enums/incident-type.enum';

export const SMS_SEGMENT_MAX = 160;

/** GSM 03.38 basic set (one septet each). */
const GSM7_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
/** GSM 03.38 extension set (two septets each: escape + char). */
const GSM7_EXTENSION = '^{}\[~]|€';

const BASIC = new Set(GSM7_BASIC);
const EXTENSION = new Set(GSM7_EXTENSION);

/** True when every character is in GSM-7, so the text is sent at 160 per segment. */
export function isGsm7(text: string): boolean {
  for (const ch of text) if (!BASIC.has(ch) && !EXTENSION.has(ch)) return false;
  return true;
}

/** Length in septets as the carrier counts it (`|`, `[`, `€`… count twice). */
export function gsm7Length(text: string): number {
  let n = 0;
  for (const ch of text) n += EXTENSION.has(ch) ? 2 : 1;
  return n;
}

const TYPOGRAPHIC: Array<[RegExp, string]> = [
  [/[‘’‚′´`]/g, "'"],
  [/[“”„″]/g, '"'],
  [/[–—−]/g, '-'],
  [/…/g, '...'],
  [/[   \t]/g, ' '],
  [/°/g, ' deg'],
];

/**
 * Text from people (a name, an announcement) made GSM-7 safe: typographic punctuation
 * becomes plain ASCII, other non-GSM characters are dropped, spaces are collapsed.
 */
export function toGsm7(text: string): string {
  let out = text;
  for (const [pattern, plain] of TYPOGRAPHIC) out = out.replace(pattern, plain);
  out = [...out].filter((ch) => BASIC.has(ch) || EXTENSION.has(ch)).join('');
  return out.replace(/[ \r\n]+/g, ' ').trim();
}

/**
 * Shortens text to `max` septets, ending with "..." when cut. Cuts at a word boundary
 * when one is close, so a word is never split in half.
 */
export function fitGsm7(text: string, max: number): string {
  if (gsm7Length(text) <= max) return text;
  if (max <= 3) return '';
  let out = '';
  for (const ch of text) {
    if (gsm7Length(out + ch) > max - 3) break;
    out += ch;
  }
  const space = out.lastIndexOf(' ');
  if (space > out.length * 0.6) out = out.slice(0, space);
  return `${out.replace(/[\s.,;:-]+$/, '')}...`;
}

/** Plain words for an incident type in an SMS ("Road accident", not ROAD_ACCIDENT). */
export const INCIDENT_TYPE_SMS_LABEL: Record<IncidentType, string> = {
  [IncidentType.MEDICAL]: 'Medical',
  [IncidentType.ROAD_ACCIDENT]: 'Road accident',
  [IncidentType.FLOOD]: 'Flood',
  [IncidentType.NATURAL_DISASTER]: 'Natural disaster',
  [IncidentType.RESCUE]: 'Rescue',
  [IncidentType.FIRE]: 'Fire',
  [IncidentType.INDUSTRIAL]: 'Industrial',
  [IncidentType.DEBRIS]: 'Debris',
  [IncidentType.OTHER]: 'Other',
};

/** The label for a stored category string; unknown values fall back to spaced lowercase. */
export function incidentTypeSmsLabel(category: string): string {
  const known = INCIDENT_TYPE_SMS_LABEL[category as IncidentType];
  if (known) return known;
  const spaced = category.replace(/_/g, ' ').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
