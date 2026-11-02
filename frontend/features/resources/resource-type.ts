import { ResourceType } from '@agap/shared';
import { titleCase } from '@/lib/incident-format';

/** Exactly the database's resource_type values (shared enum), in picker order. */
export const RESOURCE_TYPES: readonly ResourceType[] = Object.values(ResourceType);

/** Name and the kind of call each unit type is for, as the Registry's type picker shows them. */
const RESOURCE_TYPE_INFO: Record<ResourceType, { label: string; hint: string }> = {
  [ResourceType.AMBULANCE]:            { label: 'Ambulance',            hint: 'Medical and trauma' },
  [ResourceType.FIRE_TRUCK]:           { label: 'Fire truck',           hint: 'Fire and industrial' },
  [ResourceType.RESCUE_TRUCK]:         { label: 'Rescue truck',         hint: 'Road and technical rescue' },
  [ResourceType.RESCUE_BOAT]:          { label: 'Rescue boat',          hint: 'Flood operations' },
  [ResourceType.CLEARING_EQUIPMENT]:   { label: 'Clearing equipment',   hint: 'Debris and road clearing' },
  [ResourceType.MOTORCYCLE_RESPONDER]: { label: 'Motorcycle responder', hint: 'First response through traffic' },
  [ResourceType.COMMAND_VEHICLE]:      { label: 'Command vehicle',      hint: 'Incident command post' },
  [ResourceType.OTHER]:                { label: 'Other',                hint: 'Any other unit or equipment' },
};

export function resourceTypeLabel(type: string): string {
  return RESOURCE_TYPE_INFO[type as ResourceType]?.label ?? titleCase(type);
}

export function resourceTypeHint(type: string): string {
  return RESOURCE_TYPE_INFO[type as ResourceType]?.hint ?? '';
}
