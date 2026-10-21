import { IncidentType } from '../enums/incident-type.enum';
import { IncidentPriority, PRIORITY_WEIGHTS } from '../enums/incident-priority.enum';

/**
 * MOD-09 — Caller intake catalog for the three citizen-facing Bocaue categories
 * (road incident, fire, natural disaster).
 *
 * This is the single source of truth for what a citizen can answer. The mobile
 * app renders it, the backend validates against it (unknown keys and values are
 * dropped, never stored), and the operations dashboard labels stored answers
 * with it. Every question maps to a dispatch decision; every answer is optional.
 */

export interface IntakeOption {
  value: string;
  /** Citizen-facing label. */
  label: string;
  /** Dispatcher-facing wording, when it differs from the label. */
  report?: string;
  /** Selecting this clears the other choices of a multi-select question. */
  exclusive?: boolean;
}

export interface IntakeQuestion {
  key: string;
  /** Citizen-facing question. */
  question: string;
  /** Dispatcher-facing heading, e.g. "Pinned in vehicle". */
  report: string;
  options: IntakeOption[];
  hint?: string;
  multi?: boolean;
  /** Only asked when another answer includes this value. */
  showIf?: { key: string; includes: string };
}

/** Question key → selected option values. Single-select questions hold one value. */
export type IntakeAnswers = Record<string, string[]>;

export enum ReporterStatus {
  SAFE = 'SAFE',
  NEEDS_HELP = 'NEEDS_HELP',
}

export const REPORTER_STATUS_LABELS: Readonly<Record<ReporterStatus, string>> = {
  [ReporterStatus.SAFE]: 'Safe, reporting for others',
  [ReporterStatus.NEEDS_HELP]: 'Also needs help',
};

export const LANDMARK_MAX_LENGTH = 120;

const YNU: IntakeOption[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'unknown', label: 'Not sure', report: 'Unknown' },
];

const ROAD_QUESTIONS: IntakeQuestion[] = [
  {
    key: 'vehicles',
    question: 'What was involved?',
    report: 'Vehicles involved',
    multi: true,
    options: [
      { value: 'motorcycle', label: 'Motorcycle' },
      { value: 'tricycle', label: 'Tricycle / e-trike' },
      { value: 'car', label: 'Car / van' },
      { value: 'truck', label: 'Truck / bus' },
      { value: 'pedestrian', label: 'Pedestrian hit' },
    ],
  },
  { key: 'injured', question: 'Is anyone injured?', report: 'Injured people', options: YNU },
  {
    key: 'pinned',
    question: 'Is anyone pinned or stuck inside a vehicle?',
    report: 'Pinned in vehicle',
    hint: 'Rescue needs extrication tools for this.',
    options: YNU,
  },
  { key: 'fuel', question: 'Leaking fuel, smoke, or fire?', report: 'Fuel leak / fire', options: YNU },
  {
    key: 'road',
    question: 'Which road?',
    report: 'Road',
    options: [
      { value: 'macarthur', label: 'MacArthur Highway' },
      { value: 'nlex', label: 'NLEX' },
      { value: 'halili', label: 'Gov. F. Halili Ave' },
      { value: 'other', label: 'Barangay / other road' },
    ],
  },
  {
    key: 'traffic',
    question: 'Is traffic blocked?',
    report: 'Traffic',
    options: [
      { value: 'full', label: 'Fully blocked' },
      { value: 'lane', label: 'One lane blocked' },
      { value: 'clear', label: 'Still passable' },
    ],
  },
];

const FIRE_QUESTIONS: IntakeQuestion[] = [
  {
    key: 'burning',
    question: 'What is burning?',
    report: 'Burning',
    options: [
      { value: 'house', label: 'House' },
      { value: 'store', label: 'Store / business' },
      { value: 'fireworks', label: 'Fireworks shop / factory' },
      { value: 'warehouse', label: 'Warehouse / factory' },
      { value: 'vehicle', label: 'Vehicle' },
      { value: 'wires', label: 'Electric post / wires' },
      { value: 'grass', label: 'Grass / trash' },
    ],
  },
  { key: 'trapped', question: 'Is anyone trapped inside?', report: 'People trapped', options: YNU },
  {
    key: 'spreading',
    question: 'Is it spreading to nearby houses?',
    report: 'Spreading to nearby structures',
    options: YNU,
  },
  {
    key: 'explosions',
    question: 'Do you hear explosions or popping?',
    report: 'Explosions heard',
    hint: 'Fireworks and LPG tanks can explode. Keep your distance.',
    options: YNU,
  },
  { key: 'lpg', question: 'LPG tanks or chemicals nearby?', report: 'LPG / chemicals nearby', options: YNU },
];

const NATURAL_DISASTER_QUESTIONS: IntakeQuestion[] = [
  {
    key: 'event',
    question: 'What is happening?',
    report: 'Situation',
    multi: true,
    options: [
      { value: 'flood', label: 'Flooding' },
      { value: 'wind', label: 'Typhoon / wind damage' },
      { value: 'tree', label: 'Fallen tree or post' },
      { value: 'collapse', label: 'Collapsed house / wall' },
      { value: 'wires', label: 'Live wires down' },
    ],
  },
  {
    key: 'water_level',
    question: 'How deep is the water?',
    report: 'Water level',
    showIf: { key: 'event', includes: 'flood' },
    options: [
      { value: 'ankle', label: 'Ankle', report: 'Ankle-deep' },
      { value: 'knee', label: 'Knee', report: 'Knee-deep' },
      { value: 'waist', label: 'Waist', report: 'Waist-deep' },
      { value: 'chest', label: 'Chest or higher', report: 'Chest-deep or higher' },
    ],
  },
  {
    key: 'water_trend',
    question: 'Is the water still rising?',
    report: 'Water trend',
    showIf: { key: 'event', includes: 'flood' },
    options: [
      { value: 'rising', label: 'Rising' },
      { value: 'steady', label: 'Not changing', report: 'Steady' },
      { value: 'receding', label: 'Going down', report: 'Receding' },
    ],
  },
  {
    key: 'stranded',
    question: 'Are people stranded or needing evacuation?',
    report: 'Needs evacuation / rescue',
    options: YNU,
  },
  {
    key: 'vulnerable',
    question: 'Is anyone there who needs extra help?',
    report: 'Needs extra help',
    hint: 'Evacuation teams move these people first.',
    multi: true,
    options: [
      { value: 'elderly', label: 'Elderly' },
      { value: 'children', label: 'Infants / children' },
      { value: 'pwd', label: 'PWD / bedridden' },
      { value: 'pregnant', label: 'Pregnant' },
      { value: 'none', label: 'None', exclusive: true },
    ],
  },
];

/** Fallback for categories outside the three citizen-facing ones. */
export const GENERIC_INTAKE_QUESTIONS: IntakeQuestion[] = [
  { key: 'injured', question: 'Is anyone injured?', report: 'Injured people', options: YNU },
];

const INTAKE_QUESTIONS: Partial<Record<IncidentType, IntakeQuestion[]>> = {
  [IncidentType.ROAD_ACCIDENT]: ROAD_QUESTIONS,
  [IncidentType.FIRE]: FIRE_QUESTIONS,
  [IncidentType.NATURAL_DISASTER]: NATURAL_DISASTER_QUESTIONS,
  // A natural-disaster report with flooding is filed as FLOOD (see resolveIntakeCategory).
  [IncidentType.FLOOD]: NATURAL_DISASTER_QUESTIONS,
};

export function intakeQuestionsFor(type: IncidentType | string | null | undefined): IntakeQuestion[] {
  return (type && INTAKE_QUESTIONS[type as IncidentType]) || GENERIC_INTAKE_QUESTIONS;
}

export function visibleIntakeQuestions(questions: IntakeQuestion[], answers: IntakeAnswers): IntakeQuestion[] {
  return questions.filter((q) => !q.showIf || (answers[q.showIf.key] ?? []).includes(q.showIf.includes));
}

/**
 * Keeps only answers the catalog allows: known questions, known options,
 * one value for single-select, exclusive options alone, and no answers to
 * questions that were hidden. Anything else is dropped rather than stored.
 */
export function sanitizeIntakeAnswers(type: IncidentType | string, raw: unknown): IntakeAnswers {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const input = raw as Record<string, unknown>;
  const questions = intakeQuestionsFor(type);
  const clean: IntakeAnswers = {};

  for (const q of questions) {
    const value = input[q.key];
    const given = (Array.isArray(value) ? value : [value]).filter((v): v is string => typeof v === 'string');
    let picked = q.options.filter((o) => given.includes(o.value));
    if (!picked.length) continue;
    const exclusive = picked.find((o) => o.exclusive);
    if (exclusive) picked = [exclusive];
    if (!q.multi) picked = picked.slice(0, 1);
    clean[q.key] = picked.map((o) => o.value);
  }

  const visible = new Set(visibleIntakeQuestions(questions, clean).map((q) => q.key));
  for (const key of Object.keys(clean)) {
    if (!visible.has(key)) delete clean[key];
  }
  return clean;
}

export function intakeOptionReport(option: IntakeOption): string {
  return option.report ?? option.label;
}

/** Dispatcher-readable answer list, in catalog order: [{ question, answer }]. */
export function describeIntakeAnswers(
  type: IncidentType | string,
  answers: IntakeAnswers,
): { key: string; question: string; answer: string }[] {
  return visibleIntakeQuestions(intakeQuestionsFor(type), answers).flatMap((q) => {
    const chosen = q.options.filter((o) => answers[q.key]?.includes(o.value));
    return chosen.length
      ? [{ key: q.key, question: q.report, answer: chosen.map(intakeOptionReport).join(', ') }]
      : [];
  });
}

/** Flat "Heading: answer" lines, used for incident.hazard_flags. */
export function intakeReportLines(type: IncidentType | string, answers: IntakeAnswers): string[] {
  return describeIntakeAnswers(type, answers).map((a) => `${a.question}: ${a.answer}`);
}

/**
 * A "natural disaster" report that includes flooding is filed as FLOOD so the
 * flood dashboards, boat dispatch and river-level views see it; other natural
 * disasters keep NATURAL_DISASTER. Other categories are unchanged.
 */
export function resolveIntakeCategory(type: IncidentType, answers: IntakeAnswers): IncidentType {
  if (type !== IncidentType.NATURAL_DISASTER && type !== IncidentType.FLOOD) return type;
  return (answers.event ?? []).includes('flood') ? IncidentType.FLOOD : IncidentType.NATURAL_DISASTER;
}

const CATEGORY_DEFAULT_PRIORITY: Readonly<Record<IncidentType, IncidentPriority>> = {
  [IncidentType.FIRE]: IncidentPriority.HIGH,
  [IncidentType.MEDICAL]: IncidentPriority.HIGH,
  [IncidentType.ROAD_ACCIDENT]: IncidentPriority.HIGH,
  [IncidentType.FLOOD]: IncidentPriority.HIGH,
  [IncidentType.NATURAL_DISASTER]: IncidentPriority.HIGH,
  [IncidentType.RESCUE]: IncidentPriority.HIGH,
  [IncidentType.INDUSTRIAL]: IncidentPriority.HIGH,
  [IncidentType.DEBRIS]: IncidentPriority.MEDIUM,
  [IncidentType.OTHER]: IncidentPriority.MEDIUM,
};

export interface IntakePriorityRecommendation {
  priority: IncidentPriority;
  /** Caller answers that raised the priority above the category default. */
  reasons: string[];
}

/**
 * MOD-24 — assistive priority from the category plus caller answers. It only
 * ever raises the category default, and each raise names the answer behind it,
 * so the dispatcher can see why. The dispatcher confirms the final priority.
 */
export function recommendIntakePriority(
  type: IncidentType | string,
  answers: IntakeAnswers,
): IntakePriorityRecommendation {
  const base = CATEGORY_DEFAULT_PRIORITY[type as IncidentType] ?? IncidentPriority.MEDIUM;
  const has = (key: string, value: string) => (answers[key] ?? []).includes(value);
  const reasons: string[] = [];

  if (has('pinned', 'yes')) reasons.push('Person pinned in a vehicle');
  if (has('fuel', 'yes')) reasons.push('Fuel leak or fire at the crash');
  if (has('trapped', 'yes')) reasons.push('People trapped by the fire');
  if (has('burning', 'fireworks')) reasons.push('Fireworks shop or factory involved');
  if (has('explosions', 'yes')) reasons.push('Explosions heard');
  if (has('spreading', 'yes')) reasons.push('Fire spreading to nearby structures');

  if (has('stranded', 'yes')) {
    if (has('water_level', 'chest')) reasons.push('Stranded people in chest-deep water');
    if (has('water_trend', 'rising')) reasons.push('Stranded people and water still rising');
    const vulnerable = (answers.vulnerable ?? []).filter((v) => v !== 'none');
    if (vulnerable.length) reasons.push('Stranded people who need extra help');
    if (has('event', 'collapse')) reasons.push('Stranded people at a collapsed structure');
  }
  if (has('event', 'flood') && has('event', 'wires')) reasons.push('Live wires down in flood water');

  if (!reasons.length) return { priority: base, reasons };
  return {
    priority: PRIORITY_WEIGHTS[IncidentPriority.CRITICAL] > PRIORITY_WEIGHTS[base] ? IncidentPriority.CRITICAL : base,
    reasons,
  };
}
