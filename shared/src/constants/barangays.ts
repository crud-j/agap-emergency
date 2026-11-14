/**
 * The 19 barangays of Bocaue, spelled as the database spells them (`geo_regions`, seeded by
 * the barangay coordination migration). Incident barangay tags come from that table, so
 * every list a person picks from should use these names.
 *
 * The map's GeoJSON (`mobile/src/assets/geo`) spells one name "Tambobong"; that file keeps
 * its own list, and `canonicalBarangay` maps the old spelling here.
 */
export const BOCAUE_BARANGAY_NAMES = [
  'Antipona',
  'Bagumbayan',
  'Bambang',
  'Batia',
  'Biñang 1st',
  'Biñang 2nd',
  'Bolacan',
  'Bundukan',
  'Bunlo',
  'Caingin',
  'Duhat',
  'Igulot',
  'Lolomboy',
  'Poblacion',
  'Sulucan',
  'Taal',
  'Tambubong',
  'Turo',
  'Wakas',
] as const;

export type BocaueBarangayName = (typeof BOCAUE_BARANGAY_NAMES)[number];

/** Flood-prone barangays with degraded connectivity during typhoons. */
export const FLOOD_PRONE_BARANGAY_NAMES = ['Lolomboy', 'Bunlo', 'Igulot', 'Bambang'] as const;

/** Fireworks-industry barangays (industrial fire / explosion risk). */
export const INDUSTRIAL_RISK_BARANGAY_NAMES = ['Bundukan', 'Biñang 1st'] as const;

/** Lower-case ASCII letters and digits only: "Biñang 1st" → "binang1st". */
function barangayKey(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const BY_KEY = new Map<string, BocaueBarangayName>(BOCAUE_BARANGAY_NAMES.map((name) => [barangayKey(name), name]));
/** Other spellings seen in AGAP's own lists. */
const ALIASES: Record<string, BocaueBarangayName> = {
  tambobong: 'Tambubong',
  binang1: 'Biñang 1st',
  binang2: 'Biñang 2nd',
  binangi: 'Biñang 1st',
  binangii: 'Biñang 2nd',
};

/**
 * The official name for a barangay as a person or an older list wrote it ("tambobong",
 * "BIÑANG 1ST", "Binang 1st"), or null when it is not a Bocaue barangay.
 */
export function canonicalBarangay(raw: string | null | undefined): BocaueBarangayName | null {
  if (!raw) return null;
  const key = barangayKey(raw);
  if (key.length === 0) return null;
  return BY_KEY.get(key) ?? ALIASES[key] ?? null;
}

/**
 * MOD-53: should a barangay-targeted announcement reach this person?
 * - No targets (a municipality-wide notice): everyone.
 * - The person's barangay is unknown or not a Bocaue barangay: yes. We cannot tell they
 *   are outside the affected area, and a missed evacuation notice costs more than an
 *   extra text.
 * - Otherwise only when their barangay is one of the targets.
 */
export function announcementReachesBarangay(
  targetBarangays: readonly string[],
  recipientBarangay: string | null | undefined,
): boolean {
  const targets = targetBarangays.map(canonicalBarangay).filter((b): b is BocaueBarangayName => b !== null);
  if (targets.length === 0) return true;
  const mine = canonicalBarangay(recipientBarangay);
  return mine === null || targets.includes(mine);
}
