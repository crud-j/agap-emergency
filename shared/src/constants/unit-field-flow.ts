export const UNIT_FIELD_FLOWS = {
  MEDICAL_TRANSPORT: 'MEDICAL_TRANSPORT',
  MEDICAL_FIRST: 'MEDICAL_FIRST',
  FIRE: 'FIRE',
  RESCUE: 'RESCUE',
  GENERAL: 'GENERAL',
} as const;

export type UnitFieldFlow = (typeof UNIT_FIELD_FLOWS)[keyof typeof UNIT_FIELD_FLOWS];

/** Crew-facing name of each flow, e.g. the assignment header "BFP Fire Truck 1 · Fire unit". */
export const UNIT_FIELD_FLOW_LABELS: Record<UnitFieldFlow, string> = {
  MEDICAL_TRANSPORT: 'Ambulance',
  MEDICAL_FIRST: 'First-aid unit',
  FIRE: 'Fire unit',
  RESCUE: 'Rescue unit',
  GENERAL: 'Support unit',
};

/** What a crew can ask dispatch for (POST /v1/responders/assignments/:id/help-request). */
export const CREW_HELP_NEEDS = ['AMBULANCE', 'FIRE_UNIT', 'RESCUE_UNIT', 'MORE_PERSONNEL'] as const;

export type CrewHelpNeed = (typeof CREW_HELP_NEEDS)[number];

const RESOURCE_FIELD_FLOWS: Record<string, UnitFieldFlow> = {
  AMBULANCE: UNIT_FIELD_FLOWS.MEDICAL_TRANSPORT,
  MOTORCYCLE_RESPONDER: UNIT_FIELD_FLOWS.MEDICAL_FIRST,
  FIRE_TRUCK: UNIT_FIELD_FLOWS.FIRE,
  RESCUE_BOAT: UNIT_FIELD_FLOWS.RESCUE,
  RESCUE_TRUCK: UNIT_FIELD_FLOWS.RESCUE,
  CLEARING_EQUIPMENT: UNIT_FIELD_FLOWS.GENERAL,
  COMMAND_VEHICLE: UNIT_FIELD_FLOWS.GENERAL,
  OTHER: UNIT_FIELD_FLOWS.GENERAL,
};

export function fieldFlowFor(resourceType: string | null | undefined): UnitFieldFlow {
  return RESOURCE_FIELD_FLOWS[resourceType ?? ''] ?? UNIT_FIELD_FLOWS.GENERAL;
}
