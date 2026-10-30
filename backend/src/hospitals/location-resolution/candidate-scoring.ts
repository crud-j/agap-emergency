import { haversineMeters } from '@agap/shared';
import type { GeocodeCandidate } from '../../locations/maps/interfaces';

/**
 * Pure scoring of geocoder candidates for a typed hospital (plan §9.3). The numbers
 * decide; the optional AI step may only reorder ties, never change a score.
 */

/** Auto-select needs at least this score (plan §9.3). */
export const AUTO_SELECT_MIN_SCORE = 0.85;
/** A second candidate this good and this far away blocks auto-select. */
export const RIVAL_MIN_SCORE = 0.7;
export const RIVAL_MIN_DISTANCE_M = 150;
/** The province compared when the user typed none. */
export const DEFAULT_PROVINCE = 'Bulacan';

export type ResolveResult = 'AUTO_SELECTABLE' | 'NEEDS_CONFIRMATION' | 'NO_RESULTS' | 'PROVIDER_UNAVAILABLE';

/** What staff typed. Public facility data only. */
export interface HospitalNameInput {
  name: string;
  address?: string | null;
  municipality?: string | null;
  province?: string | null;
}

export interface ScoredCandidate {
  candidate: GeocodeCandidate;
  /** 0–1, four decimals. */
  score: number;
  parts: { name: number; category: number; adminArea: number; importance: number };
  reasons: string[];
  insideServiceArea: boolean;
}

/** Whole-word abbreviations expanded before searching and comparing. */
const ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\bGen\b\.?/gi, 'General'],
  [/\bHosp\b\.?/gi, 'Hospital'],
  [/\bMed\b\.?/gi, 'Medical'],
  [/\bCtr\b\.?/gi, 'Center'],
  [/\bMem\b\.?/gi, 'Memorial'],
  [/\bDist\b\.?/gi, 'District'],
  [/\bProv\b\.?/gi, 'Provincial'],
];

/**
 * The deterministic name normalizer: drops a "DOH —" prefix and a trailing
 * "Inc." / "Corp." / "Ltd.", expands common abbreviations, collapses spaces.
 * "Dr. Yanga's Hospital, Inc." → "Dr. Yanga's Hospital".
 */
export function normalizeName(name: string): string {
  let out = name.replace(/\s+/g, ' ').trim();
  out = out.replace(/^DOH\s*[—–\-:]\s*/i, '');
  out = out.replace(/[,\s]*\b(Inc|Incorporated|Corp|Corporation|Ltd)\b\.?$/i, '');
  for (const [pattern, word] of ABBREVIATIONS) out = out.replace(pattern, word);
  return out.replace(/\s+/g, ' ').trim();
}

function foldText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function nameTokens(name: string): string[] {
  return foldText(normalizeName(name)).split(' ').filter(Boolean);
}

function trigrams(text: string): Set<string> {
  const padded = `  ${text} `;
  const out = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
  return out;
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

/** Mean of token-set Jaccard and trigram Dice on the normalized names, 0–1. */
export function nameSimilarity(a: string, b: string): number {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const sa = new Set(ta);
  const sb = new Set(tb);
  const shared = [...sa].filter((t) => sb.has(t)).length;
  const jaccard = shared / new Set([...sa, ...sb]).size;
  const ga = trigrams(ta.join(' '));
  const gb = trigrams(tb.join(' '));
  const common = [...ga].filter((g) => gb.has(g)).length;
  const dice = (2 * common) / (ga.size + gb.size);
  return round4((jaccard + dice) / 2);
}

/** 1 for a hospital tag, 0.5 for a clinic, else 0 (plan §9.3). */
export function categoryMatch(category: string): number {
  const [, value] = category.split('=');
  if (value === 'hospital') return 1;
  if (value === 'clinic') return 0.5;
  return 0;
}

function areaKey(area: string): string {
  return foldText(area).replace(/^(city|municipality) of /, '').replace(/ city$/, '');
}

/** The candidate's own field, or else one comma part of its display name. */
function areaMatches(expected: string, field: string | undefined, displayName: string): boolean {
  const key = areaKey(expected);
  if (!key) return false;
  if (field) return areaKey(field) === key;
  return displayName.split(',').some((part) => areaKey(part) === key);
}

/**
 * Score one candidate: 0.55·name + 0.20·category + 0.15·admin area + 0.10·importance.
 * Admin area compares the typed municipality (when given) and province (else Bulacan).
 */
export function scoreHospitalCandidate(
  input: HospitalNameInput,
  candidate: GeocodeCandidate,
  insideServiceArea: boolean,
): ScoredCandidate {
  const reasons: string[] = [];
  const name = nameSimilarity(input.name, candidate.name);
  reasons.push(`name ${name.toFixed(2)}`);

  const category = categoryMatch(candidate.category);
  reasons.push(category === 1 ? 'category hospital' : category === 0.5 ? 'category clinic' : `category ${candidate.category}`);

  const areaChecks: number[] = [];
  const municipality = input.municipality?.trim();
  if (municipality) {
    const ok = areaMatches(municipality, candidate.address.municipality, candidate.displayName);
    areaChecks.push(ok ? 1 : 0);
    reasons.push(ok ? 'municipality match' : 'municipality differs');
  }
  const province = input.province?.trim() || DEFAULT_PROVINCE;
  const provinceOk = areaMatches(province, candidate.address.province, candidate.displayName);
  areaChecks.push(provinceOk ? 1 : 0);
  reasons.push(provinceOk ? 'province match' : 'province differs');
  const adminArea = areaChecks.reduce((sum, v) => sum + v, 0) / areaChecks.length;

  const importance = Math.min(1, Math.max(0, candidate.importance));
  if (!insideServiceArea) reasons.push('outside service area');

  return {
    candidate,
    score: round4(0.55 * name + 0.2 * category + 0.15 * adminArea + 0.1 * importance),
    parts: { name, category, adminArea, importance },
    reasons,
    insideServiceArea,
  };
}

export function byScore(a: ScoredCandidate, b: ScoredCandidate): number {
  return b.score - a.score;
}

/**
 * AUTO_SELECTABLE only if the top candidate scores ≥ 0.85, is tagged a hospital,
 * is inside the service area, and no other candidate scoring ≥ 0.70 lies more than
 * 150 m away from it (plan §9.3). No candidates → NO_RESULTS.
 */
export function decide(scored: readonly ScoredCandidate[]): Exclude<ResolveResult, 'PROVIDER_UNAVAILABLE'> {
  if (scored.length === 0) return 'NO_RESULTS';
  const [top, ...rest] = [...scored].sort(byScore);
  const rival = rest.some(
    (c) =>
      c.score >= RIVAL_MIN_SCORE &&
      haversineMeters(top!.candidate.latitude, top!.candidate.longitude, c.candidate.latitude, c.candidate.longitude) >
        RIVAL_MIN_DISTANCE_M,
  );
  return top!.score >= AUTO_SELECT_MIN_SCORE && top!.parts.category === 1 && top!.insideServiceArea && !rival
    ? 'AUTO_SELECTABLE'
    : 'NEEDS_CONFIRMATION';
}
