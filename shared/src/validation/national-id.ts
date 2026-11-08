import { isNameSuffix, nameTokens, type IdName } from './philhealth-id';

/**
 * Philippine National ID (PhilID) reading (MOD-01 registration, plan §6).
 *
 * The one source of these rules, for the app's hint and the server's decision alike. Only the
 * 16-digit PhilSys Card Number (PCN) on the front is read, never the 12-digit PhilSys Number.
 *
 * NOT YET CONFIRMED ON A REAL CARD. The plan's Phase 0 layout notes are blank: the heading and labels
 * come from plan §6's memory and one read of a Digital National ID, which is a different format.
 * Check everything here against the notes once they are filled in.
 *
 * Nothing here logs or stores anything; callers must not log the inputs either (card number and
 * names are sensitive personal information under RA 10173 and RA 11055).
 */

// Digits on one line with the separators a printed number may use. No lookbehind: Hermes compatibility.
const DIGIT_RUN = /\d+(?:[ \t]*[-–—][ \t]*\d+|[ \t]+\d+)*/g;

/** The digits of `run` if the WHOLE run is a card number. A longer run is never cut down to 16. */
function cardNumberFromRun(run: string): string | null {
  const groups = run.split(/\D+/);
  const digits = groups.join('');
  if (digits.length !== 16) return null;
  const grouped = groups.length === 4 && groups.every((group) => group.length === 4);
  return groups.length === 1 || grouped ? digits : null;
}

/**
 * The 16-digit card number in `text`, digits only, or null: 4-4-4-4, separated by nothing, spaces or a
 * dash. A 12-digit run is never accepted, because the PhilSys Number has that length. Format check
 * only: there is no public check digit.
 */
export function parsePhilSysCardNumber(text: string): string | null {
  for (const run of text.match(DIGIT_RUN) ?? []) {
    const number = cardNumberFromRun(run);
    if (number) return number;
  }
  return null;
}

// Not REPUBLIC OF THE PHILIPPINES: the PhilHealth card prints that too.
const HEADINGS = ['PAMBANSANGPAGKAKAKILANLAN', 'PHILIPPINEIDENTIFICATIONCARD'];

/**
 * The National ID heading. OCR can put junk between the two Filipino words, so they may stand apart: both
 * are specific to this card. The English words may not, since other IDs print IDENTIFICATION and PHILIPPINES.
 */
export function hasNationalIdHeading(text: string): boolean {
  // Letters only, so OCR spacing and stray symbols inside the heading don't matter.
  const letters = text.toUpperCase().replace(/[^A-Z]/g, '');
  return HEADINGS.some((heading) => letters.includes(heading)) || (letters.includes('PAMBANSANG') && letters.includes('PAGKAKAKILANLAN'));
}

/** The National ID heading and a valid card number. */
export function looksLikeNationalId(text: string): boolean {
  return hasNationalIdHeading(text) && parsePhilSysCardNumber(text) !== null;
}

/** Facts about a read that are safe to log: yes/no answers, counts and shapes, never text from the card. */
export type IdReadSignals = Record<string, string | number | boolean>;

/**
 * The shape of each long digit run, as group lengths: `4-4-4-4`, or `none`. Shows why a number didn't
 * read without any digit of it. Runs under 8 digits are left out: they're dates and OCR noise.
 */
export function digitRunShapes(text: string): string {
  const shapes = (text.match(DIGIT_RUN) ?? [])
    .map((run) => run.split(/\D+/).map((group) => group.length))
    .filter((groups) => groups.reduce((total, length) => total + length, 0) >= 8)
    .map((groups) => groups.join('-'));
  return shapes.slice(0, 4).join(',') || 'none';
}

/** Heading words, with the short code the log uses so that no text from the card reaches it. */
const HEADING_WORDS: ReadonlyArray<readonly [word: string, code: string]> = [
  ['PAMBANSANG', 'pam'],
  ['PAGKAKAKILANLAN', 'pag'],
  ['PHILIPPINE', 'phi'],
  ['IDENTIFICATION', 'ide'],
];

/** Which parts of a National ID one read found: the safe answer to "why didn't this card read?". */
export function nationalIdReadSignals(text: string): IdReadSignals {
  const letters = text.toUpperCase().replace(/[^A-Z]/g, '');
  const labels = new Set<NameField>();
  for (const found of text.matchAll(NAME_LABEL)) {
    labels.add(found[1] ? 'middle' : found[2] ? 'given' : 'last');
  }
  const fields = ['last', 'given', 'middle'] as const;
  const { values, endedBy } = readNameFields(text);
  return {
    heading: hasNationalIdHeading(text),
    headingWords: HEADING_WORDS.filter(([word]) => letters.includes(word)).map(([, code]) => code).join('+') || 'none',
    labels: fields.filter((field) => labels.has(field)).join(',') || 'none',
    nameValues: fields.filter((field) => values[field]).join(',') || 'none',
    endedBy,
    stopLabel: STOP_LABEL.test(text),
    digitRuns: digitRunShapes(text),
    lines: text.split(/\r?\n/).filter((line) => line.trim()).length,
  };
}

type NameField = 'last' | 'given' | 'middle';

/**
 * The whole label, in capture groups 1, 2 and 3. GITNANG APELYIDO comes first: it contains APELYIDO,
 * and matching it whole is what stops a middle name being read as the surname. NAME alone is no label.
 */
const NAME_LABEL =
  /(GITNANG[^A-Z]*APELYIDO\b|\bMIDDLE[^A-Z]*NAME\b)|(\bMGA[^A-Z]*PANGALAN\b|\bGIVEN[^A-Z]*NAMES?\b)|(\bAPELYIDO\b|\bLAST[^A-Z]*NAME\b)/gi;

/** What follows a label's slash on its line is the label's other half, however garbled, not a value. */
const OTHER_LABEL_HALF = /^\s*[/|\\]/;

/** Half of a garbled bilingual label can be left beside the value on the label's own line. */
const LABEL_WORDS = new Set(['APELYIDO', 'GITNANG', 'GIVEN', 'LAST', 'MGA', 'MIDDLE', 'NAME', 'NAMES', 'PANGALAN']);

/** The birth date and address labels. Reading ends here, on any line: data minimisation (plan §5.1). */
const STOP_LABEL = /\bPETSA(?:NG)?\b|KAPANGANAKAN|\b(?:DATE[^A-Z]*OF[^A-Z]*)?BIRTH\b|TIRAHAN|ADDRESS/i;

/**
 * A date, in case OCR garbled its label: a month with a day (`MONTH 01`, or `MONTH O1, I99O` where digits
 * read as letters, so `MARIA B.` isn't one), 01/01/1990, or a year.
 */
const DATE =
  /\b(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\s+(?:\d{1,2}\b|[\dOILSB]{1,2}\s*[,.]\s*[\dOILSB]{4}\b)|\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b(?:19|20)\d{2}\b/i;

/** Lines with a run of digits are never a name. */
const HAS_NUMBER = /\d{2,}/;

/** How many non-empty lines after a label may hold its value, since OCR can put a junk line between. */
const VALUE_LINES = 2;

/** At least one real word: a lone letter beside a label is OCR junk, and leaves the value to the next line. */
function isValue(tokens: string[]): boolean {
  return tokens.some((token) => token.length > 1);
}

/** Drop suffixes, and bare single letters OCR put before the value (the card's photo sits to the left). */
function cleanValue(tokens: string[]): string[] {
  const kept = tokens.filter((token) => !isNameSuffix(token));
  while (kept.length > 1 && kept[0]?.length === 1) kept.shift();
  return kept;
}

/**
 * The values of the labelled name lines, each on its label's line or the next one. Stops at the first birth
 * date or address line and never reads past it. `endedBy` says which of those ended the reading, if any.
 */
function readNameFields(text: string): { values: Partial<Record<NameField, string[]>>; endedBy: 'stopLabel' | 'date' | 'none' } {
  const values: Partial<Record<NameField, string[]>> = {};
  let waiting: { field: NameField; linesLeft: number } | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    // The card number may share a line with a label, and one of its groups can look like a year.
    const line = rawLine.replace(DIGIT_RUN, (run) => (cardNumberFromRun(run) ? ' ' : run)).trim();
    if (!line) continue;

    const stop = STOP_LABEL.exec(line)?.index ?? -1;
    const date = DATE.exec(line)?.index ?? -1;
    const stopAt = stop >= 0 && date >= 0 ? Math.min(stop, date) : Math.max(stop, date);
    const readable = stopAt >= 0 ? line.slice(0, stopAt) : line;

    const labels: { field: NameField; start: number; end: number }[] = [];
    NAME_LABEL.lastIndex = 0;
    for (let found = NAME_LABEL.exec(readable); found; found = NAME_LABEL.exec(readable)) {
      const field: NameField = found[1] ? 'middle' : found[2] ? 'given' : 'last';
      labels.push({ field, start: found.index, end: found.index + found[0].length });
    }

    if (labels.length > 0) {
      waiting = null;
      for (const [i, label] of labels.entries()) {
        if (values[label.field]) continue;
        const after = readable.slice(label.end, labels[i + 1]?.start);
        const beside = i === 0 && OTHER_LABEL_HALF.test(after) ? [] : nameTokens(after).filter((token) => !LABEL_WORDS.has(token));
        if (isValue(beside)) values[label.field] = beside;
        else if (i === labels.length - 1) waiting = { field: label.field, linesLeft: VALUE_LINES };
      }
    } else if (waiting) {
      const tokens = HAS_NUMBER.test(readable) ? null : nameTokens(readable);
      if (tokens && isValue(tokens)) {
        values[waiting.field] = tokens;
        waiting = null;
      } else {
        waiting = tokens && waiting.linesLeft > 1 ? { field: waiting.field, linesLeft: waiting.linesLeft - 1 } : null;
      }
    }

    if (stopAt >= 0) return { values, endedBy: stop >= 0 && stop === stopAt ? 'stopLabel' : 'date' };
  }
  return { values, endedBy: 'none' };
}

/**
 * The name printed on a National ID, from OCR text, or null. There is no first/middle guessing: every given
 * name goes in `first`. Null without both a last name and given names. No middle name is valid.
 */
export function parseNationalIdName(text: string): IdName | null {
  const { values } = readNameFields(text);

  // The card's own place for a suffix is still to be confirmed, so accept it on any name line.
  const all = [...(values.last ?? []), ...(values.given ?? []), ...(values.middle ?? [])];
  const suffix = all.filter(isNameSuffix).pop();
  const last = cleanValue(values.last ?? []);
  const given = cleanValue(values.given ?? []);
  const middle = cleanValue(values.middle ?? []);
  if (last.length === 0 || given.length === 0) return null;

  const name: IdName = { last: last.join(' '), first: given.join(' ') };
  if (middle.length > 0) name.middle = middle.join(' ');
  if (suffix) name.suffix = suffix;
  return name;
}
