/**
 * Minimal RFC 4180 CSV writer for analytics exports (MOD-50).
 *
 * - Cells containing a comma, quote, CR or LF are quoted; quotes are doubled.
 * - Text cells that a spreadsheet would run as a formula (= + - @ tab CR) get a
 *   leading apostrophe (CSV injection guard). Numbers are written as-is, so a
 *   negative number stays a number.
 * - Lines end with CRLF and the file starts with a UTF-8 BOM so Excel reads
 *   barangay names such as "Biñang 1st" correctly.
 */
export type CsvCell = string | number | boolean | Date | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** ISO 8601 in Asia/Manila (UTC+8, no daylight saving), e.g. 2026-11-14T09:30:00+08:00. */
export function manilaIso(at: Date): string {
  return new Date(at.getTime() + MANILA_OFFSET_MS).toISOString().replace(/\.\d{3}Z$/, '+08:00');
}

export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  const text = value instanceof Date ? manilaIso(value) : FORMULA_START.test(value) ? `'${value}` : value;
  return NEEDS_QUOTES.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  const lines = [header.map(csvCell).join(','), ...rows.map((row) => row.map(csvCell).join(','))];
  return `﻿${lines.join('\r\n')}\r\n`;
}
