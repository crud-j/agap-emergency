import { CREW_HELP_NEEDS, UNIT_FIELD_FLOWS, type CrewHelpNeed, type UnitFieldFlow } from '@agap/shared';

/**
 * The crew's "Request help" choices, most likely first (plan Phase 2 step 5). An
 * ambulance crew usually needs more hands; every other unit usually needs an ambulance.
 */
export function helpNeedsFor(flow: UnitFieldFlow): CrewHelpNeed[] {
  const first: CrewHelpNeed = flow === UNIT_FIELD_FLOWS.MEDICAL_TRANSPORT ? 'MORE_PERSONNEL' : 'AMBULANCE';
  return [first, ...CREW_HELP_NEEDS.filter((need) => need !== first)];
}
