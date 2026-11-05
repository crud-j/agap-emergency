import type { ResourceType, UnitNeed } from '@agap/shared';

/** An AVAILABLE unit the console can pre-select, best first. */
export interface CandidateUnit {
  id: string;
  resourceType: string;
  /** Home crew (resource_crew_members), any availability. */
  crewIds: string[];
}

export interface NeedStatus {
  need: UnitNeed;
  /** Units of this type already on the incident (pending, sent or accepted). */
  responding: number;
  /** Pre-selected unit ids for this need. */
  unitIds: string[];
  /** Set when the units came from `need.alternatives`, not the needed type. */
  alternativeUsed: ResourceType | null;
  /** Units still missing after pre-selection. */
  short: number;
}

export interface UnitSelectionPlan {
  /** Pre-selected unit id → crew to send with it, in dispatch order. */
  crewByUnit: Record<string, string[]>;
  unitIds: string[];
  needs: NeedStatus[];
}

/**
 * MOD-30/31 — pre-selects the units a report needs. For each need it takes the
 * best-ranked AVAILABLE units of that type (then of its alternatives), minus
 * units of that type already responding, and pre-fills each unit's home crew
 * that is on duty and not already on the incident. Nothing is dispatched here;
 * the dispatcher reviews the selection and authorizes it (rule 8).
 */
export function planUnitSelection(opts: {
  needs: UnitNeed[];
  candidates: CandidateUnit[];
  /** Resource types of the incident's active dispatches, one entry per unit. */
  respondingTypes: string[];
  availableResponderIds: ReadonlySet<string>;
  /** Responders already crewing a unit on this incident. */
  busyResponderIds?: ReadonlySet<string>;
}): UnitSelectionPlan {
  const taken = new Set<string>();
  const usedCrew = new Set<string>(opts.busyResponderIds ?? []);
  const crewByUnit: Record<string, string[]> = {};
  const unitIds: string[] = [];

  const pick = (type: string, max: number): string[] => {
    const picked: string[] = [];
    for (const unit of opts.candidates) {
      if (picked.length >= max) break;
      if (unit.resourceType !== type || taken.has(unit.id)) continue;
      taken.add(unit.id);
      picked.push(unit.id);
      crewByUnit[unit.id] = homeCrew(unit, opts.availableResponderIds, usedCrew);
      unitIds.push(unit.id);
    }
    return picked;
  };

  const needs = opts.needs.map((need): NeedStatus => {
    const responding = opts.respondingTypes.filter((t) => t === need.resourceType).length;
    const wanted = Math.max(0, need.count - responding);
    const ids = pick(need.resourceType, wanted);
    let alternativeUsed: ResourceType | null = null;
    for (const alt of need.alternatives) {
      if (ids.length >= wanted) break;
      const extra = pick(alt, wanted - ids.length);
      if (extra.length && !alternativeUsed) alternativeUsed = alt;
      ids.push(...extra);
    }
    return { need, responding, unitIds: ids, alternativeUsed, short: wanted - ids.length };
  });

  return { crewByUnit, unitIds, needs };
}

/** The unit's home crew that is on duty and not yet on another selected unit. */
export function homeCrew(
  unit: CandidateUnit,
  availableResponderIds: ReadonlySet<string>,
  usedCrew: Set<string>,
): string[] {
  const crew = unit.crewIds.filter((id) => availableResponderIds.has(id) && !usedCrew.has(id));
  crew.forEach((id) => usedCrew.add(id));
  return crew;
}
