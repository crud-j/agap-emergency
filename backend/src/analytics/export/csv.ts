/**
 * Minimal RFC 4180 CSV writer for analytics exports (MOD-50).
 *
 * - Cells containing a comma, quote, CR or LF are quoted; quotes are doubled.
 * - Text cells that a spreadsheet would run as a formula (= + - @ tab CR) get a
 *   leading apostrophe (CSV injection guard). Numbers are written as-is, so a
 *   negative number stays a number.
 * - Dates are written in Bocaue local time as `YYYY-MM-DD HH:mm`, which Excel and
 *   Google Sheets read as a date-time (column headings say "Manila time").
 * - Lines end with CRLF and the file starts with a UTF-8 BOM so Excel reads
 *   barangay names such as "Biñang 1st" correctly.
 * - An empty row ([]) is written as a blank line, to separate report sections.
 */
export type CsvCell = string | number | boolean | Date | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The UTC fields of this Date are the Asia/Manila wall-clock time (UTC+8, no daylight saving). */
function manilaWallClock(at: Date): Date {
  return new Date(at.getTime() + MANILA_OFFSET_MS);
}

/** `2026-11-14 09:30`, Manila time: sortable, and parsed as a date-time by spreadsheets. */
export function manilaDateTime(at: Date): string {
  return manilaWallClock(at).toISOString().slice(0, 16).replace('T', ' ');
}

/** `Nov 14, 2026 9:30 AM`, Manila time: for headings people read, not for sorting. */
export function manilaReadable(at: Date): string {
  const t = manilaWallClock(at);
  const hours = t.getUTCHours();
  const minutes = String(t.getUTCMinutes()).padStart(2, '0');
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${MONTHS[t.getUTCMonth()]} ${t.getUTCDate()}, ${t.getUTCFullYear()} ${hour12}:${minutes} ${hours < 12 ? 'AM' : 'PM'}`;
}

export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  const text = value instanceof Date ? manilaDateTime(value) : FORMULA_START.test(value) ? `'${value}` : value;
  return NEEDS_QUOTES.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: readonly (readonly CsvCell[])[]): string {
  return `﻿${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
