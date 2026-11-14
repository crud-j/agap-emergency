/**
 * Plain-English labels for the codes stored in the database, used only in the
 * analytics CSV exports (MOD-50). A code missing from a map (e.g. an enum value
 * added later) falls back to Title Case, so an export never fails on a new value.
 */
export function titleCase(code: string): string {
  return code
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(' ');
}

function labeler(map: Record<string, string>): (code: string | null | undefined) => string {
  return (code) => (code ? (map[code] ?? titleCase(code)) : '');
}

export const categoryLabel = labeler({
  MEDICAL: 'Medical',
  ROAD_ACCIDENT: 'Road Accident',
  FLOOD: 'Flood',
  NATURAL_DISASTER: 'Natural Disaster',
  RESCUE: 'Rescue',
  FIRE: 'Fire',
  INDUSTRIAL: 'Industrial',
  DEBRIS: 'Debris',
  OTHER: 'Other',
});

export const priorityLabel = labeler({ CRITICAL: 'Critical', HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' });

export const statusLabel = labeler({
  SUBMITTED: 'Submitted',
  RECEIVED: 'Received',
  ACKNOWLEDGED: 'Acknowledged',
  ASSESSED: 'Assessed',
  DISPATCH_PENDING: 'Awaiting Dispatch',
  DISPATCHED: 'Dispatched',
  EN_ROUTE: 'En Route',
  ON_SCENE: 'On Scene',
  TRANSPORTING: 'Transporting Patient',
  ASSISTING: 'Assisting On Scene',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
  FALSE_ALERT: 'False Alert',
  DUPLICATE: 'Duplicate',
  UNABLE_TO_RESPOND: 'Unable to Respond',
  REFERRED: 'Referred',
});

export const triggerLabel = labeler({
  SOS_BUTTON: 'SOS Button',
  SHAKE_GESTURE: 'Shake to Alert',
  MANUAL_REPORT: 'Manual Report',
  DISPATCHER_CREATED: 'Logged by Dispatcher',
  SYSTEM_GENERATED: 'System Generated',
});

export const falseAlertLabel = labeler({
  ACCIDENTAL: 'Accidental',
  DUPLICATE: 'Duplicate Report',
  TEST: 'Test Alert',
  PRANK: 'Prank',
  MISIDENTIFIED: 'Misidentified',
  OTHER: 'Other',
});

export const unitTypeLabel = labeler({
  AMBULANCE: 'Ambulance',
  RESCUE_BOAT: 'Rescue Boat',
  FIRE_TRUCK: 'Fire Truck',
  RESCUE_TRUCK: 'Rescue Truck',
  CLEARING_EQUIPMENT: 'Clearing Equipment',
  MOTORCYCLE_RESPONDER: 'Motorcycle Responder',
  COMMAND_VEHICLE: 'Command Vehicle',
  OTHER: 'Other',
});

export const roleLabel = labeler({
  SUPERVISOR: 'Supervisor',
  SYSTEM_ADMINISTRATOR: 'System Administrator',
  DISPATCHER: 'Dispatcher',
});
