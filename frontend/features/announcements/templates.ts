/**
 * Mayor's Office announcement automation (MOD-53).
 *
 * Implements docs/automation/bocaue_mayor_announcement_format.md: the operator
 * fills a few structured fields and the composer generates the headline,
 * summary, full body and push text in Filipino, English, or both.
 *
 * Rules carried over from the format standard:
 *  - Text is only ever generated from what the operator entered. Nothing here
 *    invents dates, areas, decisions or contacts.
 *  - Evacuation / suspension wording appears only when the operator confirms
 *    the competent authority actually ordered it.
 *  - Output is always a DRAFT; a person approves it before release.
 */

export type Lang = 'FIL' | 'EN';
export type LanguageMode = 'FIL' | 'EN' | 'FIL_EN';
export type Severity = 'INFORMATIONAL' | 'ADVISORY' | 'WARNING' | 'CRITICAL';

// ─── Bocaue reference data ──────────────────────────────────────────────────

/** Official barangays of Bocaue (mirrors mobile/src/config/bocaue-geo.ts). */
export const BOCAUE_BARANGAYS = [
  'Antipona', 'Bagumbayan', 'Bambang', 'Batia',
  'Biñang 1st', 'Biñang 2nd', 'Bolacan', 'Bundukan',
  'Bunlo', 'Caingin', 'Duhat', 'Igulot',
  'Lolomboy', 'Poblacion', 'Sulucan', 'Taal',
  'Tambobong', 'Turo', 'Wakas',
] as const;

/** Flood-prone barangays with degraded connectivity during typhoons (CLAUDE.md). */
export const FLOOD_PRONE_BARANGAYS = ['Lolomboy', 'Bunlo', 'Igulot', 'Bambang'] as const;

/** Bocaue River critical level — mandatory-evacuation threshold (CLAUDE.md). */
export const BOCAUE_RIVER_CRITICAL_M = 11.5;

export const ISSUERS = {
  MAYOR: {
    FIL: 'Tanggapan ng Punong Bayan ng Bocaue',
    EN: 'Office of the Municipal Mayor of Bocaue',
  },
  MAYOR_MDRRMO: {
    FIL: 'Tanggapan ng Punong Bayan at MDRRMO ng Bocaue',
    EN: 'Office of the Municipal Mayor and Bocaue MDRRMO',
  },
  MDRRMO: {
    FIL: 'Bocaue MDRRMO',
    EN: 'Bocaue MDRRMO',
  },
} as const;
export type IssuerKey = keyof typeof ISSUERS | 'OTHER';

// ─── Standard safety instructions (selectable, never auto-added) ────────────

export const SAFETY_ACTIONS: Record<string, { FIL: string; EN: string; label: string }> = {
  MONITOR: {
    label: 'Monitor official updates',
    FIL: 'Patuloy na subaybayan ang mga opisyal na abiso mula sa Munisipyo at MDRRMO.',
    EN: 'Keep monitoring official updates from the Municipality and MDRRMO.',
  },
  GO_BAG: {
    label: 'Prepare go-bag',
    FIL: 'Ihanda ang emergency go-bag (tubig, pagkain, gamot, flashlight, mahahalagang dokumento).',
    EN: 'Prepare your emergency go-bag (water, food, medicine, flashlight, important documents).',
  },
  AVOID_RIVER: {
    label: 'Stay away from the river',
    FIL: 'Iwasang lumapit o tumawid sa ilog at mga daluyan ng tubig.',
    EN: 'Stay away from the river and do not cross waterways.',
  },
  HIGHER_GROUND: {
    label: 'Move valuables to higher ground',
    FIL: 'Ilipat ang mahahalagang gamit sa mas mataas na lugar.',
    EN: 'Move valuables to higher ground.',
  },
  READY_EVACUATE: {
    label: 'Be ready to evacuate if ordered',
    FIL: 'Maging handa sa posibleng paglikas kapag ito ay ipinag-utos.',
    EN: 'Be ready to evacuate if an evacuation is ordered.',
  },
  POWER_OFF: {
    label: 'Switch off main power if flooded',
    FIL: 'Patayin ang main switch ng kuryente kapag pinapasok na ng tubig ang bahay.',
    EN: 'Switch off the main power if floodwater enters your home.',
  },
  AVOID_FLOODWATER: {
    label: 'Avoid wading in floodwater',
    FIL: 'Iwasang lumusong sa baha upang makaiwas sa leptospirosis at aksidente.',
    EN: 'Avoid wading in floodwater to prevent leptospirosis and injury.',
  },
  STAY_INDOORS: {
    label: 'Stay indoors',
    FIL: 'Manatili sa loob ng bahay hangga’t maaari.',
    EN: 'Stay indoors as much as possible.',
  },
  CALL_HOTLINE: {
    label: 'Call 911 / MDRRMO in an emergency',
    FIL: 'Sa oras ng emerhensiya, tumawag agad sa 911 o sa MDRRMO hotline.',
    EN: 'In an emergency, call 911 or the MDRRMO hotline immediately.',
  },
};

// ─── Field schema ───────────────────────────────────────────────────────────

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'datetime'
  | 'date'
  | 'select'
  | 'multicheck'
  | 'checkbox';

export interface FieldOption {
  value: string;
  label: string;
  hint?: string;
}

export interface TemplateField {
  key: string;
  type: FieldType;
  label: string;
  required?: boolean;
  placeholder?: string;
  help?: string;
  options?: FieldOption[];
  /** Only shown (and validated) when this returns true. */
  showIf?: (v: Values) => boolean;
  /** Half-width in the two-column form grid. */
  half?: boolean;
  step?: string;
}

export type Values = Record<string, string | string[] | boolean | undefined>;

export interface CommonInput {
  barangays: string[];
  wholeMunicipality: boolean;
  office: Record<Lang, string>;
  source: string;
  contact: string;
  actions: string[]; // SAFETY_ACTIONS keys
  extraAction: string;
}

/** One language's worth of generated content. */
export interface LangBlock {
  title: string;
  header: string;
  intro: string[];
  details: [string, string][];
  actionsHeading?: string;
  actions: string[];
  summary: string;
}

export interface AnnouncementTemplate {
  key: string;
  label: string;
  description: string;
  category: string;
  defaultSeverity: Severity;
  fields: TemplateField[];
  /** Area selection is required for this template. */
  requiresArea: boolean;
  /** Standard safety actions pre-ticked when the template is chosen. */
  defaultActions: string[];
  /** Whether the safety-actions checklist applies. */
  usesActions: boolean;
  suggestSeverity?: (v: Values) => Severity;
  effective?: (v: Values) => { start?: string; end?: string };
  build: (v: Values, lang: Lang, c: CommonInput) => LangBlock;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const str = (v: Values[string]): string => (typeof v === 'string' ? v.trim() : '');
const arr = (v: Values[string]): string[] => (Array.isArray(v) ? v : []);

const FIL_MONTHS = [
  'Enero', 'Pebrero', 'Marso', 'Abril', 'Mayo', 'Hunyo',
  'Hulyo', 'Agosto', 'Setyembre', 'Oktubre', 'Nobyembre', 'Disyembre',
];
const FIL_DAYS = ['Linggo', 'Lunes', 'Martes', 'Miyerkules', 'Huwebes', 'Biyernes', 'Sabado'];
const EN_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const EN_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * `datetime-local` / `date` inputs are entered in Bocaue local time. Pin them to
 * +08:00 so the stored instant never depends on the operator's browser zone.
 */
export function manilaInputToIso(value: string): string | undefined {
  if (!value) return undefined;
  const withTime = value.length === 10 ? `${value}T00:00` : value;
  const d = new Date(`${withTime}:00+08:00`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Inverse of manilaInputToIso — ISO instant → `YYYY-MM-DDTHH:mm` in Manila. */
export function isoToManilaInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(new Date(iso).getTime() + 8 * 3600_000);
  return d.toISOString().slice(0, 16);
}

interface ManilaParts { y: number; m: number; d: number; dow: number; hh: number; mm: number }

function manilaParts(value: string): ManilaParts | null {
  const iso = manilaInputToIso(value);
  if (!iso) return null;
  const local = new Date(new Date(iso).getTime() + 8 * 3600_000);
  return {
    y: local.getUTCFullYear(), m: local.getUTCMonth(), d: local.getUTCDate(),
    dow: local.getUTCDay(), hh: local.getUTCHours(), mm: local.getUTCMinutes(),
  };
}

function fmtTime(p: ManilaParts): string {
  const h12 = p.hh % 12 === 0 ? 12 : p.hh % 12;
  return `${h12}:${String(p.mm).padStart(2, '0')} ${p.hh < 12 ? 'AM' : 'PM'}`;
}

/** "Martes, Oktubre 14, 2026" / "Tuesday, October 14, 2026" */
export function fmtDate(value: string, lang: Lang): string {
  const p = manilaParts(value);
  if (!p) return '';
  return lang === 'FIL'
    ? `${FIL_DAYS[p.dow]}, ${FIL_MONTHS[p.m]} ${p.d}, ${p.y}`
    : `${EN_DAYS[p.dow]}, ${EN_MONTHS[p.m]} ${p.d}, ${p.y}`;
}

/** "Oktubre 14, 2026, 2:30 PM" */
export function fmtDateTime(value: string, lang: Lang): string {
  const p = manilaParts(value);
  if (!p) return '';
  const month = (lang === 'FIL' ? FIL_MONTHS : EN_MONTHS)[p.m];
  return `${month} ${p.d}, ${p.y}, ${fmtTime(p)}`;
}

/** Short form used in titles: "Okt 14" / "Oct 14". */
function fmtShortDate(value: string, lang: Lang): string {
  const p = manilaParts(value);
  if (!p) return '';
  const month = (lang === 'FIL' ? FIL_MONTHS : EN_MONTHS)[p.m]!;
  return `${month.slice(0, 3)} ${p.d}`;
}

function joinList(items: string[], lang: Lang): string {
  if (items.length <= 1) return items[0] ?? '';
  const and = lang === 'FIL' ? 'at' : 'and';
  return `${items.slice(0, -1).join(', ')} ${and} ${items[items.length - 1]}`;
}

/** Area phrase for use mid-sentence ("sa buong bayan ng Bocaue"). */
export function areaText(c: CommonInput, lang: Lang): string {
  if (c.wholeMunicipality) return lang === 'FIL' ? 'buong bayan ng Bocaue' : 'all of Bocaue';
  if (c.barangays.length === 0) return '';
  return `Brgy. ${joinList(c.barangays, lang)}`;
}

/** Capitalised form for labels, details rows and previews. */
export const cap = (s: string): string => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

function actionLines(c: CommonInput, lang: Lang): string[] {
  const lines = c.actions
    .map((k) => SAFETY_ACTIONS[k]?.[lang])
    .filter((x): x is string => !!x);
  const extra = c.extraAction
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  return [...lines, ...extra];
}

const ACTIONS_HEADING: Record<Lang, string> = {
  FIL: 'PINAG-IINGATAN / MGA DAPAT GAWIN',
  EN: 'WHAT YOU NEED TO DO',
};

// ─── Templates ──────────────────────────────────────────────────────────────

const TREND_OPTIONS: FieldOption[] = [
  { value: 'RISING', label: 'Rising' },
  { value: 'STEADY', label: 'Steady' },
  { value: 'RECEDING', label: 'Receding' },
];

const TREND_TEXT: Record<string, Record<Lang, string>> = {
  RISING: { FIL: 'at patuloy na tumataas', EN: 'and still rising' },
  STEADY: { FIL: 'at nananatiling pareho', EN: 'and holding steady' },
  RECEDING: { FIL: 'at unti-unti nang bumababa', EN: 'and slowly receding' },
};

const evacFields: TemplateField[] = [
  {
    key: 'evacuationOrdered',
    type: 'checkbox',
    label: 'Evacuation has been officially ordered',
    help: 'Tick only if the competent authority has confirmed the order. Otherwise no evacuation wording is added.',
  },
  {
    key: 'evacuationCenters',
    type: 'textarea',
    label: 'Evacuation centers',
    placeholder: 'e.g. Bocaue Central School gym; Brgy. Bunlo covered court',
    required: true,
    showIf: (v) => v['evacuationOrdered'] === true,
  },
];

function evacIntro(v: Values, lang: Lang, c: CommonInput): string[] {
  if (v['evacuationOrdered'] !== true) return [];
  const area = areaText(c, lang) || (lang === 'FIL' ? 'mga apektadong lugar' : 'the affected areas');
  const centers = str(v['evacuationCenters']);
  return lang === 'FIL'
    ? [`Ipinag-uutos ang paglikas ng mga residente ng ${area}.${centers ? ` Pumunta sa mga itinalagang evacuation center: ${centers}.` : ''}`]
    : [`Residents of ${area} are ordered to evacuate.${centers ? ` Proceed to the designated evacuation centers: ${centers}.` : ''}`];
}

const RIVER_LEVEL: AnnouncementTemplate = {
  key: 'RIVER_LEVEL',
  label: 'Bocaue River water level',
  description: 'Gauge reading with trend. Auto-marks Critical at 11.50 m.',
  category: 'FLOOD_ALERT',
  defaultSeverity: 'ADVISORY',
  requiresArea: false,
  usesActions: true,
  defaultActions: ['MONITOR', 'AVOID_RIVER', 'GO_BAG', 'CALL_HOTLINE'],
  fields: [
    { key: 'level', type: 'number', label: 'Water level (meters)', required: true, half: true, step: '0.01', placeholder: '10.85' },
    { key: 'trend', type: 'select', label: 'Trend', required: true, half: true, options: TREND_OPTIONS },
    { key: 'observedAt', type: 'datetime', label: 'Reading time', required: true, half: true },
    { key: 'gauge', type: 'text', label: 'Gauge / station', half: true, placeholder: 'e.g. Bocaue Bridge gauge' },
    ...evacFields,
  ],
  suggestSeverity: (v) => {
    const level = Number(str(v['level']));
    if (Number.isFinite(level) && level >= BOCAUE_RIVER_CRITICAL_M) return 'CRITICAL';
    if (v['evacuationOrdered'] === true) return 'CRITICAL';
    if (str(v['trend']) === 'RISING') return 'WARNING';
    return 'ADVISORY';
  },
  build: (v, lang, c) => {
    const level = Number(str(v['level']));
    const lv = Number.isFinite(level) ? level.toFixed(2) : '—';
    const critical = Number.isFinite(level) && level >= BOCAUE_RIVER_CRITICAL_M;
    const when = fmtDateTime(str(v['observedAt']), lang);
    const trend = TREND_TEXT[str(v['trend'])]?.[lang] ?? '';
    const gauge = str(v['gauge']);
    const area = areaText(c, lang);
    const intro =
      lang === 'FIL'
        ? [
            `Ayon sa pinakahuling beripikadong pagsukat${gauge ? ` sa ${gauge}` : ''}, ang antas ng tubig sa Ilog Bocaue ay ${lv} metro${when ? ` as of ${when}` : ''}${trend ? `, ${trend}` : ''}.`,
            critical
              ? `Ito ay nasa o lampas na sa kritikal na antas na ${BOCAUE_RIVER_CRITICAL_M.toFixed(2)} metro.`
              : `Ang kritikal na antas ng ilog ay ${BOCAUE_RIVER_CRITICAL_M.toFixed(2)} metro.`,
            ...evacIntro(v, lang, c),
          ]
        : [
            `Based on the latest verified reading${gauge ? ` at ${gauge}` : ''}, the Bocaue River water level is ${lv} meters${when ? ` as of ${when}` : ''}${trend ? `, ${trend}` : ''}.`,
            critical
              ? `This is at or above the critical level of ${BOCAUE_RIVER_CRITICAL_M.toFixed(2)} meters.`
              : `The river's critical level is ${BOCAUE_RIVER_CRITICAL_M.toFixed(2)} meters.`,
            ...evacIntro(v, lang, c),
          ];
    const title =
      lang === 'FIL'
        ? critical
          ? `BABALA: Ilog Bocaue, Nasa Kritikal na Antas (${lv} m)`
          : `ABISO: Antas ng Tubig sa Ilog Bocaue — ${lv} m`
        : critical
          ? `WARNING: Bocaue River at Critical Level (${lv} m)`
          : `ADVISORY: Bocaue River Water Level — ${lv} m`;
    const summary =
      lang === 'FIL'
        ? `Ang Ilog Bocaue ay nasa ${lv} m${trend ? ` ${trend}` : ''}${critical ? ', lampas na sa kritikal na antas' : ''}.${v['evacuationOrdered'] === true ? ' May utos ng paglikas.' : ' Maging alerto.'}`
        : `Bocaue River is at ${lv} m${trend ? ` ${trend}` : ''}${critical ? ', at or above critical level' : ''}.${v['evacuationOrdered'] === true ? ' Evacuation has been ordered.' : ' Stay alert.'}`;
    return {
      title,
      header: lang === 'FIL' ? 'ABISO SA KALIGTASAN' : 'SAFETY ADVISORY',
      intro,
      details: [
        [lang === 'FIL' ? 'Antas ng tubig' : 'Water level', `${lv} m`],
        [lang === 'FIL' ? 'Kritikal na antas' : 'Critical level', `${BOCAUE_RIVER_CRITICAL_M.toFixed(2)} m`],
        ...(area ? [[lang === 'FIL' ? 'Apektadong lugar' : 'Affected areas', cap(area)] as [string, string]] : []),
        ...(when ? [[lang === 'FIL' ? 'Huling beripikasyon' : 'Last verified', when] as [string, string]] : []),
      ],
      actionsHeading: ACTIONS_HEADING[lang],
      actions: actionLines(c, lang),
      summary,
    };
  },
};

const RAIN_LEVELS: Record<string, { FIL: string; EN: string; meaningFIL: string; meaningEN: string; severity: Severity; hint: string }> = {
  YELLOW: {
    FIL: 'Yellow', EN: 'Yellow', severity: 'ADVISORY',
    meaningFIL: 'Posible ang pagbaha sa mabababang lugar at malapit sa mga ilog.',
    meaningEN: 'Flooding is possible in low-lying areas and near river channels.',
    hint: 'Flooding possible',
  },
  ORANGE: {
    FIL: 'Orange', EN: 'Orange', severity: 'WARNING',
    meaningFIL: 'May banta ng pagbaha sa mabababang lugar at malapit sa mga ilog.',
    meaningEN: 'Flooding is threatening in low-lying areas and near river channels.',
    hint: 'Flooding threatening',
  },
  RED: {
    FIL: 'Red', EN: 'Red', severity: 'CRITICAL',
    meaningFIL: 'Inaasahan ang malubhang pagbaha sa mabababang lugar at malapit sa mga ilog.',
    meaningEN: 'Serious flooding is expected in low-lying areas and near river channels.',
    hint: 'Serious flooding expected',
  },
};

const RAINFALL: AnnouncementTemplate = {
  key: 'RAINFALL',
  label: 'Rainfall advisory (PAGASA)',
  description: 'Relay a PAGASA heavy rainfall warning — Yellow, Orange or Red.',
  category: 'WEATHER_ADVISORY',
  defaultSeverity: 'ADVISORY',
  requiresArea: false,
  usesActions: true,
  defaultActions: ['MONITOR', 'AVOID_FLOODWATER', 'HIGHER_GROUND', 'CALL_HOTLINE'],
  fields: [
    {
      key: 'level', type: 'select', label: 'Warning level', required: true, half: true,
      options: Object.entries(RAIN_LEVELS).map(([value, r]) => ({ value, label: r.EN, hint: r.hint })),
    },
    { key: 'issuedAt', type: 'datetime', label: 'PAGASA issued at', required: true, half: true },
    { key: 'validUntil', type: 'datetime', label: 'Valid until', half: true, help: 'Leave blank if PAGASA did not state one.' },
    { key: 'outlook', type: 'textarea', label: 'Additional PAGASA outlook', placeholder: 'Optional — copy only what the bulletin says' },
    ...evacFields,
  ],
  suggestSeverity: (v) =>
    v['evacuationOrdered'] === true ? 'CRITICAL' : (RAIN_LEVELS[str(v['level'])]?.severity ?? 'ADVISORY'),
  effective: (v) => ({
    ...(str(v['issuedAt']) && { start: str(v['issuedAt']) }),
    ...(str(v['validUntil']) && { end: str(v['validUntil']) }),
  }),
  build: (v, lang, c) => {
    const r = RAIN_LEVELS[str(v['level'])];
    const color = r ? r[lang] : '—';
    const issued = fmtDateTime(str(v['issuedAt']), lang);
    const until = fmtDateTime(str(v['validUntil']), lang);
    const outlook = str(v['outlook']);
    const area = areaText(c, lang);
    const intro =
      lang === 'FIL'
        ? [
            `Ayon sa PAGASA${issued ? ` (inilabas noong ${issued})` : ''}, nakataas ang ${color} Rainfall Warning sa Bocaue.`,
            ...(r ? [r.meaningFIL] : []),
            ...(outlook ? [outlook] : []),
            ...evacIntro(v, lang, c),
          ]
        : [
            `PAGASA${issued ? ` (issued ${issued})` : ''} has raised ${color === 'Orange' ? 'an' : 'a'} ${color} Rainfall Warning over Bocaue.`,
            ...(r ? [r.meaningEN] : []),
            ...(outlook ? [outlook] : []),
            ...evacIntro(v, lang, c),
          ];
    return {
      title:
        lang === 'FIL'
          ? `BABALA SA ULAN: ${color} Rainfall Warning sa Bocaue`
          : `RAINFALL WARNING: ${color} Warning over Bocaue`,
      header: lang === 'FIL' ? 'ABISO SA PANAHON' : 'WEATHER ADVISORY',
      intro,
      details: [
        [lang === 'FIL' ? 'Antas ng babala' : 'Warning level', color],
        ...(until ? [[lang === 'FIL' ? 'Epektibo hanggang' : 'Valid until', until] as [string, string]] : []),
        ...(area ? [[lang === 'FIL' ? 'Apektadong lugar' : 'Affected areas', cap(area)] as [string, string]] : []),
      ],
      actionsHeading: ACTIONS_HEADING[lang],
      actions: actionLines(c, lang),
      summary:
        lang === 'FIL'
          ? `${color} Rainfall Warning sa Bocaue. ${r?.meaningFIL ?? ''}`.trim()
          : `${color} Rainfall Warning over Bocaue. ${r?.meaningEN ?? ''}`.trim(),
    };
  },
};

const FLOOD_DEPTHS: FieldOption[] = [
  { value: 'GUTTER', label: 'Gutter-deep (~8 in)' },
  { value: 'HALF_KNEE', label: 'Half-knee (~10 in)' },
  { value: 'KNEE', label: 'Knee-deep (~19 in)' },
  { value: 'WAIST', label: 'Waist-deep (~37 in)' },
  { value: 'CHEST', label: 'Chest-deep (~45 in)' },
];
const FLOOD_DEPTH_TEXT: Record<string, Record<Lang, string>> = {
  GUTTER: { FIL: 'hanggang gutter (~8 pulgada)', EN: 'gutter-deep (~8 in)' },
  HALF_KNEE: { FIL: 'hanggang kalahati ng tuhod (~10 pulgada)', EN: 'half-knee deep (~10 in)' },
  KNEE: { FIL: 'hanggang tuhod (~19 pulgada)', EN: 'knee-deep (~19 in)' },
  WAIST: { FIL: 'hanggang baywang (~37 pulgada)', EN: 'waist-deep (~37 in)' },
  CHEST: { FIL: 'hanggang dibdib (~45 pulgada)', EN: 'chest-deep (~45 in)' },
};

const FLOOD: AnnouncementTemplate = {
  key: 'FLOOD',
  label: 'Flood advisory',
  description: 'Flooded barangays, depth and impassable roads.',
  category: 'FLOOD_ALERT',
  defaultSeverity: 'WARNING',
  requiresArea: true,
  usesActions: true,
  defaultActions: ['AVOID_FLOODWATER', 'POWER_OFF', 'HIGHER_GROUND', 'CALL_HOTLINE'],
  fields: [
    { key: 'depth', type: 'select', label: 'Flood depth', required: true, half: true, options: FLOOD_DEPTHS },
    { key: 'observedAt', type: 'datetime', label: 'As of', required: true, half: true },
    { key: 'roads', type: 'textarea', label: 'Roads not passable', placeholder: 'e.g. MacArthur Highway (Lolomboy section) — not passable to light vehicles' },
    ...evacFields,
  ],
  suggestSeverity: (v) => {
    if (v['evacuationOrdered'] === true) return 'CRITICAL';
    const d = str(v['depth']);
    if (d === 'WAIST' || d === 'CHEST') return 'CRITICAL';
    if (d === 'KNEE') return 'WARNING';
    return 'ADVISORY';
  },
  build: (v, lang, c) => {
    const area = areaText(c, lang) || (lang === 'FIL' ? 'ilang bahagi ng Bocaue' : 'parts of Bocaue');
    const depth = FLOOD_DEPTH_TEXT[str(v['depth'])]?.[lang] ?? '';
    const when = fmtDateTime(str(v['observedAt']), lang);
    const roads = str(v['roads']);
    const shortArea = c.wholeMunicipality
      ? 'Bocaue'
      : c.barangays.length > 2
        ? `${c.barangays.slice(0, 2).join(', ')} +${c.barangays.length - 2}`
        : c.barangays.join(', ');
    return {
      title:
        lang === 'FIL'
          ? `ABISO SA BAHA: ${shortArea || 'Bocaue'}`
          : `FLOOD ADVISORY: ${shortArea || 'Bocaue'}`,
      header: lang === 'FIL' ? 'ABISO SA KALIGTASAN' : 'SAFETY ADVISORY',
      intro:
        lang === 'FIL'
          ? [
              `May pagbaha sa ${area}${depth ? ` na ${depth}` : ''}${when ? `, as of ${when}` : ''}.`,
              ...(roads ? [`Hindi madaanan: ${roads}`] : []),
              ...evacIntro(v, lang, c),
            ]
          : [
              `Flooding has been reported in ${area}${depth ? `, ${depth}` : ''}${when ? ` as of ${when}` : ''}.`,
              ...(roads ? [`Not passable: ${roads}`] : []),
              ...evacIntro(v, lang, c),
            ],
      details: [
        [lang === 'FIL' ? 'Apektadong lugar' : 'Affected areas', cap(area)],
        ...(depth ? [[lang === 'FIL' ? 'Lalim ng baha' : 'Flood depth', depth] as [string, string]] : []),
        ...(when ? [[lang === 'FIL' ? 'Huling beripikasyon' : 'Last verified', when] as [string, string]] : []),
      ],
      actionsHeading: ACTIONS_HEADING[lang],
      actions: actionLines(c, lang),
      summary:
        lang === 'FIL'
          ? `May baha sa ${area}${depth ? ` (${depth})` : ''}. Iwasang lumusong at mag-ingat.`
          : `Flooding in ${area}${depth ? ` (${depth})` : ''}. Avoid floodwater and stay safe.`,
    };
  },
};

const EVACUATION: AnnouncementTemplate = {
  key: 'EVACUATION',
  label: 'Evacuation order',
  description: 'Preemptive or forced evacuation — confirmed orders only.',
  category: 'EVACUATION_ORDER',
  defaultSeverity: 'CRITICAL',
  requiresArea: true,
  usesActions: true,
  defaultActions: ['GO_BAG', 'POWER_OFF', 'CALL_HOTLINE'],
  fields: [
    {
      key: 'type', type: 'select', label: 'Type', required: true, half: true,
      options: [
        { value: 'PREEMPTIVE', label: 'Preemptive evacuation' },
        { value: 'FORCED', label: 'Forced evacuation' },
      ],
    },
    { key: 'effectiveAt', type: 'datetime', label: 'Effective from', required: true, half: true },
    { key: 'reason', type: 'text', label: 'Reason', required: true, placeholder: 'e.g. Bocaue River above 11.50 m and still rising' },
    { key: 'centers', type: 'textarea', label: 'Evacuation centers', required: true, placeholder: 'One per line' },
    { key: 'transport', type: 'textarea', label: 'Transport assistance', placeholder: 'Only if confirmed — e.g. pick-up points and times' },
    {
      key: 'confirmed', type: 'checkbox', required: true,
      label: 'I confirm this order was issued by the competent authority',
    },
  ],
  suggestSeverity: () => 'CRITICAL',
  effective: (v) => (str(v['effectiveAt']) ? { start: str(v['effectiveAt']) } : {}),
  build: (v, lang, c) => {
    const area = areaText(c, lang) || '—';
    const forced = str(v['type']) === 'FORCED';
    const when = fmtDateTime(str(v['effectiveAt']), lang);
    const centers = str(v['centers']).split('\n').map((s) => s.trim()).filter(Boolean);
    const transport = str(v['transport']);
    const kind = lang === 'FIL'
      ? forced ? 'sapilitang paglikas (forced evacuation)' : 'preemptive na paglikas'
      : forced ? 'forced evacuation' : 'preemptive evacuation';
    return {
      title:
        lang === 'FIL'
          ? `UTOS NG PAGLIKAS: ${c.wholeMunicipality ? 'Bocaue' : c.barangays.join(', ')}`
          : `EVACUATION ORDER: ${c.wholeMunicipality ? 'Bocaue' : c.barangays.join(', ')}`,
      header: lang === 'FIL' ? 'ABISO SA KALIGTASAN' : 'SAFETY ADVISORY',
      intro:
        lang === 'FIL'
          ? [
              `Ipinatutupad ang ${kind} para sa mga residente ng ${area}${when ? ` simula ${when}` : ''}, dahil sa ${str(v['reason'])}.`,
              ...(centers.length ? [`Pumunta sa mga itinalagang evacuation center: ${centers.join('; ')}.`] : []),
              ...(transport ? [`Tulong sa transportasyon: ${transport}`] : []),
            ]
          : [
              `A ${kind} is in effect for residents of ${area}${when ? ` starting ${when}` : ''} due to ${str(v['reason'])}.`,
              ...(centers.length ? [`Proceed to the designated evacuation centers: ${centers.join('; ')}.`] : []),
              ...(transport ? [`Transport assistance: ${transport}`] : []),
            ],
      details: [
        [lang === 'FIL' ? 'Apektadong lugar' : 'Affected areas', cap(area)],
        ...(when ? [[lang === 'FIL' ? 'Simula' : 'Effective', when] as [string, string]] : []),
      ],
      actionsHeading: ACTIONS_HEADING[lang],
      actions: actionLines(c, lang),
      summary:
        lang === 'FIL'
          ? `${forced ? 'Sapilitang' : 'Preemptive na'} paglikas sa ${area}. Pumunta sa itinalagang evacuation center.`
          : `${forced ? 'Forced' : 'Preemptive'} evacuation for ${area}. Proceed to your designated evacuation center.`,
    };
  },
};

const LEVEL_OPTIONS: FieldOption[] = [
  { value: 'ALL', label: 'All levels' },
  { value: 'KINDER', label: 'Kindergarten' },
  { value: 'ELEM', label: 'Elementary' },
  { value: 'JHS', label: 'Junior High' },
  { value: 'SHS', label: 'Senior High' },
  { value: 'COLLEGE', label: 'College' },
];
const LEVEL_TEXT: Record<string, Record<Lang, string>> = {
  ALL: { FIL: 'lahat ng antas', EN: 'all levels' },
  KINDER: { FIL: 'Kindergarten', EN: 'Kindergarten' },
  ELEM: { FIL: 'Elementarya', EN: 'Elementary' },
  JHS: { FIL: 'Junior High School', EN: 'Junior High School' },
  SHS: { FIL: 'Senior High School', EN: 'Senior High School' },
  COLLEGE: { FIL: 'Kolehiyo', EN: 'College' },
};
const SCHOOL_TYPE_TEXT: Record<string, Record<Lang, string>> = {
  BOTH: { FIL: 'pampubliko at pribadong paaralan', EN: 'public and private schools' },
  PUBLIC: { FIL: 'pampublikong paaralan', EN: 'public schools' },
  PRIVATE: { FIL: 'pribadong paaralan', EN: 'private schools' },
};

const CLASS_SUSPENSION: AnnouncementTemplate = {
  key: 'CLASS_SUSPENSION',
  label: 'Class suspension',
  description: 'Authorized suspension only — never inferred from a forecast.',
  category: 'CLASS_SUSPENSION',
  defaultSeverity: 'ADVISORY',
  requiresArea: false,
  usesActions: false,
  defaultActions: [],
  fields: [
    { key: 'date', type: 'date', label: 'Date of suspension', required: true, half: true },
    {
      key: 'schoolType', type: 'select', label: 'Schools covered', required: true, half: true,
      options: [
        { value: 'BOTH', label: 'Public and private' },
        { value: 'PUBLIC', label: 'Public only' },
        { value: 'PRIVATE', label: 'Private only' },
      ],
    },
    { key: 'levels', type: 'multicheck', label: 'Levels', required: true, options: LEVEL_OPTIONS },
    { key: 'basis', type: 'text', label: 'Basis (order / memo)', required: true, placeholder: 'e.g. Executive Order No. __, s. 2026' },
    { key: 'notes', type: 'textarea', label: 'Other verified details', placeholder: 'e.g. Modular / asynchronous classes per school advisory' },
  ],
  effective: (v) => (str(v['date']) ? { start: str(v['date']) } : {}),
  build: (v, lang, c) => {
    const date = fmtDate(str(v['date']), lang);
    const levels = arr(v['levels']);
    const levelText = levels.includes('ALL')
      ? LEVEL_TEXT['ALL']![lang]
      : joinList(levels.map((l) => LEVEL_TEXT[l]?.[lang] ?? l), lang);
    const schools = SCHOOL_TYPE_TEXT[str(v['schoolType'])]?.[lang] ?? '';
    const area = areaText(c, lang) || (lang === 'FIL' ? 'Bocaue' : 'Bocaue');
    const basis = str(v['basis']);
    const notes = str(v['notes']);
    return {
      title:
        lang === 'FIL'
          ? `ANUNSYO: Walang Pasok — ${fmtShortDate(str(v['date']), lang)}`
          : `CLASS SUSPENSION — ${fmtShortDate(str(v['date']), lang)}`,
      header: lang === 'FIL' ? 'ANUNSYO: SUSPENSIYON NG KLASE' : 'ANNOUNCEMENT: CLASS SUSPENSION',
      intro:
        lang === 'FIL'
          ? [
              `Ipinababatid ng ${c.office.FIL} na suspendido ang klase sa ${levelText} sa mga ${schools} sa ${area}${date ? ` sa ${date}` : ''}${basis ? `, alinsunod sa ${basis}` : ''}.`,
              ...(notes ? [notes] : []),
            ]
          : [
              `The ${c.office.EN} announces that classes in ${levelText} at ${schools} in ${area} are suspended${date ? ` on ${date}` : ''}${basis ? `, pursuant to ${basis}` : ''}.`,
              ...(notes ? [notes] : []),
            ],
      details: [
        [lang === 'FIL' ? 'Saklaw' : 'Coverage', `${levelText} — ${schools}`],
        ...(date ? [[lang === 'FIL' ? 'Petsa ng bisa' : 'Effective date', date] as [string, string]] : []),
      ],
      actions: [],
      summary: (() => {
        const short = fmtShortDate(str(v['date']), lang);
        const where = c.wholeMunicipality || c.barangays.length === 0 ? '' : ` sa ${area}`;
        const whereEn = c.wholeMunicipality || c.barangays.length === 0 ? '' : ` in ${area}`;
        const kind = str(v['schoolType']) === 'BOTH' ? '' : ` (${schools})`;
        return lang === 'FIL'
          ? `Walang pasok sa ${levelText}${kind}${where}${short ? ` sa ${short}` : ''}, ayon sa ${basis || 'opisyal na kautusan'}.`
          : `No classes in ${levelText}${kind}${whereEn}${short ? ` on ${short}` : ''}, per ${basis || 'official order'}.`;
      })(),
    };
  },
};

const ROAD_CLOSURE: AnnouncementTemplate = {
  key: 'ROAD_CLOSURE',
  label: 'Road closure / traffic',
  description: 'Closure or rerouting with times and alternate route.',
  category: 'ROAD_CLOSURE',
  defaultSeverity: 'ADVISORY',
  requiresArea: false,
  usesActions: false,
  defaultActions: [],
  fields: [
    { key: 'road', type: 'text', label: 'Road / location', required: true, placeholder: 'e.g. Governor F. Halili Avenue near Brgy. Turo' },
    {
      key: 'kind', type: 'select', label: 'Type', required: true, half: true,
      options: [
        { value: 'CLOSURE', label: 'Full closure' },
        { value: 'PARTIAL', label: 'Partial closure (one lane)' },
        { value: 'REROUTE', label: 'Rerouting' },
      ],
    },
    { key: 'reason', type: 'text', label: 'Reason', half: true, placeholder: 'e.g. Flooding, road repair' },
    { key: 'start', type: 'datetime', label: 'Start', required: true, half: true },
    { key: 'end', type: 'datetime', label: 'End', half: true, help: 'Leave blank if not yet known.' },
    { key: 'alternate', type: 'textarea', label: 'Alternate route', placeholder: 'Only if confirmed by the responsible office' },
    { key: 'motorists', type: 'textarea', label: 'Instructions for motorists' },
  ],
  effective: (v) => ({
    ...(str(v['start']) && { start: str(v['start']) }),
    ...(str(v['end']) && { end: str(v['end']) }),
  }),
  build: (v, lang) => {
    const kind = str(v['kind']);
    const kindText: Record<string, Record<Lang, string>> = {
      CLOSURE: { FIL: 'pagsasara ng kalsada', EN: 'a full road closure' },
      PARTIAL: { FIL: 'bahagyang pagsasara ng kalsada', EN: 'a partial road closure' },
      REROUTE: { FIL: 'rerouting ng trapiko', EN: 'traffic rerouting' },
    };
    const road = str(v['road']);
    const start = fmtDateTime(str(v['start']), lang);
    const end = fmtDateTime(str(v['end']), lang);
    const reason = str(v['reason']);
    const alt = str(v['alternate']);
    const motorists = str(v['motorists']);
    return {
      title:
        lang === 'FIL'
          ? `ABISO SA TRAPIKO: ${kind === 'REROUTE' ? 'Rerouting sa' : 'Pagsasara ng'} ${road}`
          : `TRAFFIC ADVISORY: ${kind === 'REROUTE' ? 'Rerouting on' : 'Closure of'} ${road}`,
      header: lang === 'FIL' ? 'ABISO SA TRAPIKO' : 'TRAFFIC ADVISORY',
      intro:
        lang === 'FIL'
          ? [`Magkakaroon ng ${kindText[kind]?.FIL ?? 'pagbabago sa trapiko'} sa ${road}${start ? ` mula ${start}` : ''}${end ? ` hanggang ${end}` : ''}${reason ? `, dahil sa ${reason}` : ''}.`]
          : [`There will be ${kindText[kind]?.EN ?? 'a traffic change'} on ${road}${start ? ` from ${start}` : ''}${end ? ` until ${end}` : ''}${reason ? ` due to ${reason}` : ''}.`],
      details: [
        [lang === 'FIL' ? 'Apektadong lugar' : 'Affected road', road],
        ...(alt ? [[lang === 'FIL' ? 'Alternatibong ruta' : 'Alternate route', alt] as [string, string]] : []),
        ...(motorists ? [[lang === 'FIL' ? 'Mga motorista' : 'Motorists', motorists] as [string, string]] : []),
      ],
      actions: [],
      summary:
        lang === 'FIL'
          ? `${kind === 'REROUTE' ? 'Rerouting' : 'Sarado'} ang ${road}${start ? ` mula ${start}` : ''}.${alt ? ' May alternatibong ruta.' : ''}`
          : `${road} ${kind === 'REROUTE' ? 'traffic is rerouted' : 'is closed'}${start ? ` from ${start}` : ''}.${alt ? ' An alternate route is available.' : ''}`,
    };
  },
};

const GENERAL: AnnouncementTemplate = {
  key: 'GENERAL',
  label: 'Public advisory',
  description: 'General notice from the Mayor’s Office.',
  category: 'PUBLIC_ADVISORY',
  defaultSeverity: 'INFORMATIONAL',
  requiresArea: false,
  usesActions: true,
  defaultActions: [],
  fields: [
    { key: 'subject', type: 'text', label: 'Subject', required: true, placeholder: 'e.g. Pagbabago sa Oras ng Serbisyo sa Munisipyo' },
    { key: 'message', type: 'textarea', label: 'Main announcement (one clear sentence)', required: true },
    { key: 'details', type: 'textarea', label: 'More details' },
    { key: 'when', type: 'datetime', label: 'Date / time', half: true },
    { key: 'venue', type: 'text', label: 'Venue', half: true },
    { key: 'audience', type: 'text', label: 'Who is affected', placeholder: 'e.g. Residents applying for business permits' },
  ],
  effective: (v) => (str(v['when']) ? { start: str(v['when']) } : {}),
  build: (v, lang, c) => {
    const subject = str(v['subject']);
    const message = str(v['message']).replace(/\.$/, '');
    const more = str(v['details']);
    const when = fmtDateTime(str(v['when']), lang);
    const venue = str(v['venue']);
    const audience = str(v['audience']);
    const area = areaText(c, lang);
    return {
      title: lang === 'FIL' ? `PAALALA: ${subject}` : `PUBLIC ADVISORY: ${subject}`,
      header: lang === 'FIL' ? 'PAALALA SA MGA BOCAUEÑO' : 'PUBLIC ADVISORY',
      intro:
        lang === 'FIL'
          ? [`Ipinababatid ng ${c.office.FIL} na ${message}.`, ...(more ? [more] : [])]
          : [`The ${c.office.EN} informs the public that ${message}.`, ...(more ? [more] : [])],
      details: [
        ...(when ? [[lang === 'FIL' ? 'Petsa at oras' : 'Date and time', when] as [string, string]] : []),
        ...(venue ? [[lang === 'FIL' ? 'Lugar' : 'Venue', venue] as [string, string]] : []),
        ...(area ? [[lang === 'FIL' ? 'Apektadong lugar' : 'Affected areas', cap(area)] as [string, string]] : []),
        ...(audience ? [[lang === 'FIL' ? 'Saklaw' : 'Who is affected', audience] as [string, string]] : []),
      ],
      actionsHeading: lang === 'FIL' ? 'ANO ANG DAPAT GAWIN?' : 'WHAT YOU NEED TO DO',
      actions: actionLines(c, lang),
      summary: `${message}.`,
    };
  },
};

export const TEMPLATES: AnnouncementTemplate[] = [
  RIVER_LEVEL,
  RAINFALL,
  FLOOD,
  EVACUATION,
  CLASS_SUSPENSION,
  ROAD_CLOSURE,
  GENERAL,
];

export function getTemplate(key: string | null | undefined): AnnouncementTemplate | undefined {
  return TEMPLATES.find((t) => t.key === key);
}

// ─── Assembly ───────────────────────────────────────────────────────────────

export function visibleFields(t: AnnouncementTemplate, v: Values): TemplateField[] {
  return t.fields.filter((f) => !f.showIf || f.showIf(v));
}

function renderBlock(b: LangBlock, lang: Lang, c: CommonInput, withFooter: boolean): string {
  const parts: string[] = [b.header, '', ...b.intro.flatMap((p) => [p, ''])];
  if (b.details.length) {
    parts.push(...b.details.map(([k, val]) => `${k}: ${val}`), '');
  }
  if (b.actions.length) {
    parts.push(b.actionsHeading ?? ACTIONS_HEADING[lang], ...b.actions.map((a) => `- ${a}`), '');
  }
  if (withFooter) {
    if (c.contact) {
      parts.push(
        lang === 'FIL'
          ? `Para sa mga katanungan, makipag-ugnayan sa ${c.contact}.`
          : `For questions, contact ${c.contact}.`,
        '',
      );
    }
    parts.push(`${lang === 'FIL' ? 'Inilabas ng' : 'Issued by'}: ${c.office[lang]}`);
    if (c.source) parts.push(`${lang === 'FIL' ? 'Sanggunian' : 'Reference'}: ${c.source}`);
  }
  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export interface GeneratedAnnouncement {
  title: string;
  summary: string;
  body: string;
  actionRequired: string;
  push: { title: string; body: string };
  issuingOffice: string;
}

const PUSH_SUFFIX: Record<Lang, string> = {
  FIL: 'Tingnan ang buong detalye sa app.',
  EN: 'See full details in the app.',
};

export function generate(
  t: AnnouncementTemplate,
  v: Values,
  mode: LanguageMode,
  c: CommonInput,
): GeneratedAnnouncement {
  const primary: Lang = mode === 'EN' ? 'EN' : 'FIL';
  const main = t.build(v, primary, c);

  let body: string;
  let issuingOffice: string;
  if (mode === 'FIL_EN') {
    const en = t.build(v, 'EN', c);
    const footer = [
      ...(c.contact ? [`Para sa katanungan / For questions: ${c.contact}`] : []),
      `Inilabas ng / Issued by: ${c.office.FIL} / ${c.office.EN}`,
      ...(c.source ? [`Sanggunian / Reference: ${c.source}`] : []),
    ].join('\n');
    body = [
      renderBlock(main, 'FIL', c, false),
      renderBlock(en, 'EN', c, false),
      footer,
    ].join('\n\n');
    issuingOffice = c.office.FIL === c.office.EN ? c.office.FIL : `${c.office.FIL} / ${c.office.EN}`;
  } else {
    body = renderBlock(main, primary, c, true);
    issuingOffice = c.office[primary];
  }

  const summary = main.summary.replace(/\s+/g, ' ').trim();
  return {
    title: main.title.replace(/\s+/g, ' ').trim(),
    summary,
    body,
    actionRequired: main.actions.join('\n'),
    push: {
      title: main.title.replace(/\s+/g, ' ').trim(),
      body: `${summary} ${PUSH_SUFFIX[primary]}`,
    },
    issuingOffice,
  };
}

// ─── Readiness checks (mirrors the server-side gate) ────────────────────────

export const SOURCE_REQUIRED_CATEGORIES = new Set([
  'FLOOD_ALERT', 'WEATHER_ADVISORY', 'EVACUATION_ORDER', 'CLASS_SUSPENSION', 'ROAD_CLOSURE',
  'FIRE_ADVISORY', 'INDUSTRIAL_HAZARD', 'RESCUE_UPDATE', 'POST_DISASTER_UPDATE',
]);

export interface ReadinessItem {
  label: string;
  ok: boolean;
}

export function readiness(
  t: AnnouncementTemplate,
  v: Values,
  c: CommonInput,
  severity: Severity,
  opts: { manualText?: boolean } = {},
): ReadinessItem[] {
  // When the text is written by hand, the template fields no longer drive it.
  const missingField = opts.manualText ? undefined : visibleFields(t, v).find((f) => {
    if (!f.required) return false;
    const val = v[f.key];
    if (f.type === 'checkbox') return val !== true;
    if (f.type === 'multicheck') return arr(val).length === 0;
    return !str(val);
  });
  const needsSource = SOURCE_REQUIRED_CATEGORIES.has(t.category) || severity !== 'INFORMATIONAL';
  return [
    { label: missingField ? `Required: ${missingField.label}` : 'Template details complete', ok: !missingField },
    {
      label: 'Affected area selected',
      ok: !t.requiresArea || c.wholeMunicipality || c.barangays.length > 0,
    },
    { label: 'Issuing office set', ok: !!c.office.FIL.trim() },
    { label: needsSource ? 'Verified source / reference' : 'Source (optional for this notice)', ok: !needsSource || !!c.source.trim() },
  ];
}
