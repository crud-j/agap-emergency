/**
 * PhilHealth ID reading and name matching (MOD-01 registration, plan §6).
 *
 * The one source of these rules: the mobile app uses them for the live "matches your
 * PhilHealth ID" hint and the backend for the final decision, so the two never disagree.
 * Card layout from Phase 0: heading `PhilHealth` / `Philippine Health Insurance Corporation`,
 * then the PIN as `NN-NNNNNNNNN-N`, then `LAST, FIRST MIDDLE` on one line in capitals.
 *
 * Nothing here logs or stores anything; callers must not log the inputs either (PIN and
 * names are sensitive personal information under RA 10173).
 */

export interface IdName {
  last: string;
  first: string;
  middle?: string;
  suffix?: string;
}

export type MiddleNameResult = 'match' | 'initial' | 'omitted' | 'mismatch';

export interface IdNameMatch {
  matches: boolean;
  parts: { last: boolean; first: boolean; middle: MiddleNameResult; suffix: boolean };
}

const NAME_SUFFIXES = new Set(['JR', 'SR', 'II', 'III', 'IV']);

/** Words that start a compound surname (DELA CRUZ, DE LOS SANTOS, SANTA MARIA), after normalisation. */
const SURNAME_PARTICLES = new Set([
  'DE', 'DEL', 'DELA', 'DELAS', 'DELOS', 'DI', 'LA', 'LAS', 'LOS', 'SAN', 'SANTA', 'SANTO', 'VDA',
]);

/** Letters an OCR slip may differ by: words this long or longer may be one edit off. */
const SLIP_MIN_LENGTH = 5;

// Spelled out rather than String.normalize('NFD'), so the result is identical on Hermes and Node.
const ACCENTS: Record<string, string> = {
  À: 'A', Á: 'A', Â: 'A', Ã: 'A', Ä: 'A', Å: 'A',
  Ç: 'C',
  È: 'E', É: 'E', Ê: 'E', Ë: 'E',
  Ì: 'I', Í: 'I', Î: 'I', Ï: 'I',
  Ñ: 'N',
  Ò: 'O', Ó: 'O', Ô: 'O', Õ: 'O', Ö: 'O', Ø: 'O',
  Ù: 'U', Ú: 'U', Û: 'U', Ü: 'U',
  Ý: 'Y',
};

function stripAccents(upper: string): string {
  return upper.replace(/[À-ÖØ-Ý]/g, (ch) => ACCENTS[ch] ?? ch);
}

/**
 * Trim; uppercase; strip accents (Ñ→N, É→E); drop periods and commas (a period glued to the
 * next word, as in `STO.NIÑO`, becomes a space); hyphens and repeated spaces become single
 * spaces; expand STA→SANTA and STO→SANTO.
 */
export function normalizeNamePart(value: string): string {
  return stripAccents(value.trim().toUpperCase())
    .replace(/\.(?=[A-Z])/g, ' ')
    .replace(/[.,]/g, '')
    .replace(/[-‐–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => (word === 'STA' ? 'SANTA' : word === 'STO' ? 'SANTO' : word))
    .join(' ');
}

// 2-9-1 grouping, separated by nothing, spaces or a dash. No lookbehind: Hermes compatibility.
const PIN_PATTERN = /(?:^|\D)(\d{2})[ \t]*[-–—]?[ \t]*(\d{9})[ \t]*[-–—]?[ \t]*(\d)(?!\d)/;

/** The 12-digit PhilHealth PIN in `text`, digits only, or null. Format check only: there is no public check digit. */
export function parsePhilHealthPin(text: string): string | null {
  const match = PIN_PATTERN.exec(text);
  return match ? `${match[1]}${match[2]}${match[3]}` : null;
}

/** The PhilHealth heading (`PHILHEALTH` or `PHILIPPINE HEALTH INSURANCE`) and a valid PIN. */
export function looksLikePhilHealthId(text: string): boolean {
  // Letters only, so OCR spacing and stray symbols inside the heading don't matter.
  const letters = stripAccents(text.toUpperCase()).replace(/[^A-Z]/g, '');
  const heading = letters.includes('PHILHEALTH') || letters.includes('PHILIPPINEHEALTHINSURANCE');
  return heading && parsePhilHealthPin(text) !== null;
}

/** Words that look like printed name words: mostly capitals. OCR junk is usually lowercase or symbols. */
function nameTokens(raw: string): string[] {
  return raw
    .replace(/[^A-Za-zÀ-ÖØ-öø-ÿ.'\- ]/g, ' ')
    .split(/\s+/)
    .map((token) => token.replace(/^[.'-]+|['-]+$/g, ''))
    .filter((token) => {
      const letters = token.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, '');
      if (!letters) return false;
      const upper = letters.replace(/[^A-ZÀ-ÖØ-Þ]/g, '').length;
      return letters.length === 1 ? upper === 1 : upper / letters.length > 0.5;
    })
    .map((token) => token.toUpperCase());
}

function words(value: string | undefined): string[] {
  const normalized = normalizeNamePart(value ?? '');
  return normalized ? normalized.split(' ') : [];
}

/**
 * Where the given names may split into first and middle. The card prints `FIRST MIDDLE` with
 * no separator, so `MARIA CLARA SANTOS` could be MARIA CLARA + SANTOS or MARIA CLARA SANTOS with
 * no middle name. Allowed: no middle, a one-word middle, or a middle starting with a surname
 * particle (DELA CRUZ). `preferred` goes first.
 */
function splitPoints(given: string[], preferred?: number): number[] {
  const points = new Set<number>();
  if (preferred !== undefined && preferred >= 1 && preferred <= given.length) points.add(preferred);
  if (given.length >= 2) points.add(given.length - 1);
  for (let i = 1; i <= given.length - 2; i++) {
    if (SURNAME_PARTICLES.has(given[i] ?? '')) points.add(i);
  }
  if (given.length >= 1) points.add(given.length);
  return [...points];
}

/** The most likely split of the card's given names: a particle-led compound middle, else the last word. */
function preferredSplit(given: string[]): number {
  if (given.length <= 1) return given.length;
  for (let i = 1; i <= given.length - 2; i++) {
    if (SURNAME_PARTICLES.has(given[i] ?? '')) return i;
  }
  return given.length - 1;
}

function buildName(lastRaw: string[], givenRaw: string[]): IdName | null {
  // The card may print the suffix after the surname or after the given names.
  const isSuffix = (token: string) => NAME_SUFFIXES.has(normalizeNamePart(token));
  const suffix = [...lastRaw, ...givenRaw].filter(isSuffix).pop();
  const lastTokens = lastRaw.filter((token) => !isSuffix(token));
  const given = givenRaw.filter((token) => !isSuffix(token));

  // A single stray letter before the surname is OCR junk (Phase 0 saw exactly that).
  while (lastTokens.length > 1 && (lastTokens[0]?.replace(/[^A-ZÀ-Þ]/g, '').length ?? 0) <= 1) lastTokens.shift();
  if (lastTokens.length === 0 || given.length === 0) return null;

  const at = preferredSplit(given.map((token) => normalizeNamePart(token)));
  const name: IdName = { last: lastTokens.join(' '), first: given.slice(0, at).join(' ') };
  if (at < given.length) name.middle = given.slice(at).join(' ');
  if (suffix) name.suffix = suffix;
  return name;
}

/** Lines with a run of digits are the PIN, the birth date or the address, never the name. */
const HAS_NUMBER = /\d{2,}/;

function nameFromLine(line: string, next: string | undefined, separator = ','): IdName | null {
  if (HAS_NUMBER.test(line)) return null;
  const at = line.indexOf(separator);
  if (at < 0) return null;

  const lastRaw = nameTokens(line.slice(0, at));
  let givenRaw = nameTokens(line.slice(at + 1).replace(/,/g, ' '));
  // `LAST,` at the end of a line with the given names on the next one.
  if (givenRaw.length === 0 && next && !HAS_NUMBER.test(next) && !next.includes(',')) {
    givenRaw = nameTokens(next);
  }
  return buildName(lastRaw, givenRaw);
}

/**
 * The name printed on a PhilHealth ID, from OCR text, or null. Looks for the `LAST, FIRST MIDDLE`
 * line after the PIN first, then anywhere on the card. Tolerates stray symbols and lowercase OCR
 * junk around the name, extra spaces, and a line break after `LAST,`. Never reads the birth date,
 * sex or address (plan §5.1, data minimisation).
 */
export function parsePhilHealthName(text: string): IdName | null {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const pinLine = lines.findIndex((line) => parsePhilHealthPin(line) !== null);
  const starts = pinLine >= 0 ? [pinLine + 1, 0] : [0];

  for (const start of starts) {
    for (let i = start; i < lines.length; i++) {
      const name = nameFromLine(lines[i] ?? '', lines[i + 1]);
      if (name) return name;
    }
  }

  // The comma misread as `.`, `;` or `:` on the line right after the PIN.
  if (pinLine >= 0) {
    const line = (lines[pinLine + 1] ?? '').replace(/^[^A-Za-zÀ-ÿ]+/, '');
    const misread = /[.;:]/.exec(line);
    if (misread) return nameFromLine(line, lines[pinLine + 2], misread[0]);
  }
  return null;
}

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + cost);
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}

/** Same words in the same order. A card word of 5+ letters may be one edit off (OCR slip); shorter ones must be exact. */
function wordsMatch(typed: string[], onId: string[]): boolean {
  if (typed.length !== onId.length) return false;
  return typed.every((word, i) => {
    const idWord = onId[i] ?? '';
    return word === idWord || (idWord.length >= SLIP_MIN_LENGTH && editDistance(word, idWord) <= 1);
  });
}

function matchMiddle(typed: string[], onId: string[]): MiddleNameResult {
  if (onId.length === 0) return typed.length === 0 ? 'match' : 'mismatch';
  if (typed.length === 0) return 'omitted';
  if (wordsMatch(typed, onId)) return 'match';
  const initials = typed.join('');
  if (initials === onId[0]?.[0] || initials === onId.map((word) => word[0]).join('')) return 'initial';
  return 'mismatch';
}

/**
 * Does the typed name match the name on the ID? Last and first names must match (multi-word
 * surnames as a whole). The middle name may be typed in full, as an initial, or left blank.
 * The suffix must match when the ID shows one. Swapping first and last fails.
 */
export function matchIdName(typed: IdName, onId: IdName): IdNameMatch {
  const last = wordsMatch(words(typed.last), words(onId.last));

  const idFirst = words(onId.first);
  const given = [...idFirst, ...words(onId.middle)];
  const typedFirst = words(typed.first);
  const typedMiddle = words(typed.middle);

  let first = false;
  let middle: MiddleNameResult = matchMiddle(typedMiddle, words(onId.middle));
  for (const at of splitPoints(given, idFirst.length)) {
    if (!wordsMatch(typedFirst, given.slice(0, at))) continue;
    const result = matchMiddle(typedMiddle, given.slice(at));
    if (!first || result !== 'mismatch') {
      first = true;
      middle = result;
    }
    if (result !== 'mismatch') break;
  }

  const idSuffix = normalizeNamePart(onId.suffix ?? '');
  const suffix = !idSuffix || normalizeNamePart(typed.suffix ?? '') === idSuffix;

  return { matches: last && first && middle !== 'mismatch' && suffix, parts: { last, first, middle, suffix } };
}

/** `First Middle Last Suffix` with single spaces, as typed. What `User.full_name` stores. */
export function composeFullName(name: IdName): string {
  return [name.first, name.middle, name.last, name.suffix]
    .map((part) => (part ?? '').trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .join(' ');
}
