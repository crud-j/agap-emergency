import {
  ID_VERIFICATION_CONSENT_TYPE,
  ID_VERIFICATION_NATIONAL_ID_CONSENT_TYPE,
  IdVerificationErrorCode,
  type IdDocumentType,
  type IdRejectionReason,
} from '../constants/identity-verification';
import {
  digitRunShapes,
  hasNationalIdHeading,
  looksLikeNationalId,
  nationalIdReadSignals,
  parseNationalIdName,
  parsePhilSysCardNumber,
  type IdReadSignals,
} from './national-id';
import { hasPhilHealthHeading, looksLikePhilHealthId, parsePhilHealthName, parsePhilHealthPin, type IdName } from './philhealth-id';

/** Part of a card image, as fractions (0–1) of its width and height, measured from the card's edges. */
export interface IdImageRegion {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface IdDocumentRules {
  /** The ID's name in server and staff messages. English only: the app has its own translated text. */
  label: string;
  /** Finishes "Enter …" when staff type this ID's number. */
  numberPrompt: string;
  hasHeading(text: string): boolean;
  looksLike(text: string): boolean;
  parseNumber(text: string): string | null;
  parseName(text: string): IdName | null;
  /** For the server log, when a read fails: which parts it found. Never text from the card. */
  readSignals(text: string): IdReadSignals;
  consentType: string;
  /** The scan failure when the image isn't this ID. */
  wrongCardCode: IdVerificationErrorCode.NOT_PHILHEALTH_ID | IdVerificationErrorCode.NOT_NATIONAL_ID;
  /** The "wrong card" reason staff may use for this ID. */
  rejectionReason: IdRejectionReason;
  /** Approving a review scan with no stored number needs staff to type it, so the card is held (plan §7, N8). */
  approvalNeedsNumber: boolean;
  /**
   * Where the name labels and values sit, for a read of that part alone when a whole-card read loses the
   * name. null: the ID has none, and is only read whole.
   */
  nameRegion: IdImageRegion | null;
}

/**
 * The National ID's name column. Measured on one plastic card (layout only, 2026-11-09): the labels and
 * values start about 46% across, right of the main photo (6–28%) and a smaller ghost photo (32–40%);
 * the last-name label is about 33% down, the middle-name value ends about 70% down, and the birth date
 * label follows at about 71–74%, which is where the name reading stops. The card number (6–38% across,
 * 26–31% down) stays outside it. Margins of a few percent allow for the scanner's crop.
 */
const NATIONAL_ID_NAME_REGION: IdImageRegion = { left: 0.43, top: 0.28, width: 0.57, height: 0.47 };

/**
 * Everything that differs by ID, in one place (plan §6). Each parser runs only for its own chosen type,
 * so a PhilHealth PIN can't be read as a card number, or the reverse.
 */
export const ID_DOCUMENT_RULES: Record<IdDocumentType, IdDocumentRules> = {
  PHILHEALTH: {
    label: 'PhilHealth ID',
    numberPrompt: 'the 12-digit number printed on the PhilHealth ID',
    hasHeading: hasPhilHealthHeading,
    looksLike: looksLikePhilHealthId,
    parseNumber: parsePhilHealthPin,
    parseName: parsePhilHealthName,
    readSignals: (text) => ({ digitRuns: digitRunShapes(text) }),
    consentType: ID_VERIFICATION_CONSENT_TYPE,
    wrongCardCode: IdVerificationErrorCode.NOT_PHILHEALTH_ID,
    rejectionReason: 'NOT_PHILHEALTH',
    approvalNeedsNumber: false,
    nameRegion: null,
  },
  NATIONAL_ID: {
    label: 'National ID',
    numberPrompt: 'the 16-digit card number printed on the front of the National ID, not the PhilSys Number',
    hasHeading: hasNationalIdHeading,
    looksLike: looksLikeNationalId,
    parseNumber: parsePhilSysCardNumber,
    parseName: parseNationalIdName,
    readSignals: nationalIdReadSignals,
    consentType: ID_VERIFICATION_NATIONAL_ID_CONSENT_TYPE,
    wrongCardCode: IdVerificationErrorCode.NOT_NATIONAL_ID,
    rejectionReason: 'NOT_NATIONAL_ID',
    approvalNeedsNumber: true,
    nameRegion: NATIONAL_ID_NAME_REGION,
  },
};

export interface CombinedIdRead {
  /** The chosen ID's heading appeared in at least one read. Without it, nothing else counts. */
  headingSeen: boolean;
  number: string | null;
  name: IdName | null;
  /** Two reads found different numbers: at least one is misread, so neither is trusted. */
  numberConflict: boolean;
}

/** The value most reads gave; a tie goes to the one that came first. */
function mostCommon(values: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best = values[0] ?? '';
  for (const value of values) if ((counts.get(value) ?? 0) > (counts.get(best) ?? 0)) best = value;
  return best;
}

/**
 * Each name part as most reads gave it. One misread letter in one read is outvoted by the reads that got
 * that part right, which a single "best" read can't do. A missing middle name or suffix is a vote too, so
 * a card without one keeps none. With one name, or a tie, the earliest read wins.
 */
export function voteIdName(names: readonly IdName[]): IdName | null {
  if (names.length === 0) return null;
  const name: IdName = {
    last: mostCommon(names.map((n) => n.last)),
    first: mostCommon(names.map((n) => n.first)),
  };
  const middle = mostCommon(names.map((n) => n.middle ?? ''));
  const suffix = mostCommon(names.map((n) => n.suffix ?? ''));
  if (middle) name.middle = middle;
  if (suffix) name.suffix = suffix;
  return name;
}

/**
 * What the server's reads of ONE image found between them, using only the chosen ID's parsers. Each read
 * can keep what another lost, because a layout that keeps the name can drop the number. Pass the most
 * confident read first: each name part is voted across the reads that found a name (voteIdName), ties go to
 * the earlier read, and the typed-name check still applies.
 *
 * `confirmingTexts` are reads that may back up or contradict the number but never supply it alone: reads of
 * a resized copy of the same pixels, whose mistakes repeat each other's (two of them once agreed on the
 * same wrong digit). They vote on the name like any read, after `texts`.
 */
export function combineIdReads(
  rules: IdDocumentRules,
  texts: readonly string[],
  confirmingTexts: readonly string[] = [],
): CombinedIdRead {
  const all = [...texts, ...confirmingTexts];
  if (!all.some((text) => rules.hasHeading(text))) {
    return { headingSeen: false, number: null, name: null, numberConflict: false };
  }
  const numbersIn = (list: readonly string[]) => new Set(list.map((text) => rules.parseNumber(text)).filter((number) => number !== null));
  const numbers = numbersIn(all);
  const [only] = numbers;
  return {
    headingSeen: true,
    number: numbers.size === 1 && only && numbersIn(texts).size === 1 ? only : null,
    name: voteIdName(all.map((text) => rules.parseName(text)).filter((name): name is IdName => name !== null)),
    numberConflict: numbers.size > 1,
  };
}

/** For the server log: how many reads agreed on each name part, as counts (e.g. `last=3/4`). Never a name. */
export function nameVoteCounts(rules: IdDocumentRules, texts: readonly string[]): string {
  const names = texts.map((text) => rules.parseName(text)).filter((name): name is IdName => name !== null);
  const voted = voteIdName(names);
  if (!voted) return 'none';
  const parts = ['last', 'first', 'middle'] as const;
  return parts.map((part) => `${part}=${names.filter((n) => (n[part] ?? '') === (voted[part] ?? '')).length}/${names.length}`).join(',');
}

/**
 * For the server log only, never a decision: how much of the phone's reading the server's own reads back
 * up, as counts. Measures whether "the phone proposes, the server confirms" could work on real cards.
 */
export function phoneReadSupport(rules: IdDocumentRules, clientText: string, serverTexts: readonly string[]): IdReadSignals {
  const number = rules.parseNumber(clientText);
  const name = rules.parseName(clientText);
  const serverDigits = serverTexts.join('\n').replace(/\D/g, '');
  const serverLetters = serverTexts.join('\n').toUpperCase().replace(/[^A-Z]/g, '');
  const groups = number?.match(/\d{1,4}/g) ?? [];
  const words = name ? [name.last, name.first, name.middle ?? ''].join(' ').toUpperCase().split(/[^A-Z]+/).filter((word) => word.length > 1) : [];
  return {
    phoneNumberSeen: number ? `${groups.filter((group) => serverDigits.includes(group)).length}/${groups.length}` : 'none',
    phoneNameSeen: name ? `${words.filter((word) => serverLetters.includes(word)).length}/${words.length}` : 'none',
  };
}
