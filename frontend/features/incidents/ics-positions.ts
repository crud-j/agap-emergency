/**
 * ICS positions (MOD-36) with plain-language descriptions, in the order the
 * Command page shows them. Keys match the backend's ics_position enum.
 */

export interface IcsPositionInfo {
  key: string;
  label: string;
  description: string;
}

export const INCIDENT_COMMANDER = 'INCIDENT_COMMANDER';

export const ICS_POSITIONS: readonly IcsPositionInfo[] = [
  {
    key: INCIDENT_COMMANDER,
    label: 'Incident Commander',
    description: 'In charge of the whole response. Makes the final decisions.',
  },
  {
    key: 'OPERATIONS_SECTION_CHIEF',
    label: 'Operations Chief',
    description: 'Runs the teams on the ground: rescue, medical and fire.',
  },
  {
    key: 'PLANNING_SECTION_CHIEF',
    label: 'Planning Chief',
    description: 'Tracks the situation and plans the next few hours.',
  },
  {
    key: 'LOGISTICS_SECTION_CHIEF',
    label: 'Logistics Chief',
    description: 'Gets vehicles, fuel, food, water and equipment where they are needed.',
  },
  {
    key: 'SAFETY_OFFICER',
    label: 'Safety Officer',
    description: 'Watches for dangers to responders and can stop unsafe work.',
  },
  {
    key: 'PUBLIC_INFORMATION_OFFICER',
    label: 'Public Information Officer',
    description: 'Gives updates to the public, families and the media.',
  },
  {
    key: 'LIAISON_OFFICER',
    label: 'Liaison Officer',
    description: 'Contact person for other agencies: BFP, PNP, barangays and hospitals.',
  },
];

export function icsPositionLabel(key: string): string {
  return ICS_POSITIONS.find((p) => p.key === key)?.label
    ?? key.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
