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
}

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

/**
 * What the server's reads of ONE image found between them, using only the chosen ID's parsers. Each read
 * can keep what another lost, because a layout that keeps the name can drop the number. Pass the most
 * confident read first: its name wins if two reads differ, and the typed-name check still applies.
 */
export function combineIdReads(rules: IdDocumentRules, texts: readonly string[]): CombinedIdRead {
  if (!texts.some((text) => rules.hasHeading(text))) {
    return { headingSeen: false, number: null, name: null, numberConflict: false };
  }
  const numbers = new Set(texts.map((text) => rules.parseNumber(text)).filter((number) => number !== null));
  const [only] = numbers;
  return {
    headingSeen: true,
    number: numbers.size === 1 && only ? only : null,
    name: texts.map((text) => rules.parseName(text)).find((name) => name !== null) ?? null,
    numberConflict: numbers.size > 1,
  };
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
