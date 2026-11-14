/**
 * A response unit's operational status (MOD-27). Mirrors the `resource_status` enum in
 * backend/prisma/schema.prisma; a backend test fails if the two drift apart.
 */
export enum ResourceStatus {
  AVAILABLE = 'AVAILABLE',
  DISPATCHED = 'DISPATCHED',
  EN_ROUTE = 'EN_ROUTE',
  ON_SCENE = 'ON_SCENE',
  TRANSPORTING = 'TRANSPORTING',
  RETURNING = 'RETURNING',
  OUT_OF_SERVICE = 'OUT_OF_SERVICE',
  OFFLINE = 'OFFLINE',
  RESERVED = 'RESERVED',
}

/** Committed to an incident; the dashboard counts these as deployed. */
export const DEPLOYED_RESOURCE_STATUSES: readonly ResourceStatus[] = [
  ResourceStatus.DISPATCHED,
  ResourceStatus.EN_ROUTE,
  ResourceStatus.ON_SCENE,
  ResourceStatus.TRANSPORTING,
  ResourceStatus.RETURNING,
  ResourceStatus.RESERVED,
];

/**
 * A unit on a mission. Only the system sets these: dispatch (DISPATCHED) and the crew's
 * progress on the responder app (EN_ROUTE, ON_SCENE, TRANSPORTING). Never set by hand,
 * so the fleet board can't claim a unit in the workshop is transporting a patient.
 */
export const MISSION_RESOURCE_STATUSES: readonly ResourceStatus[] = [
  ResourceStatus.DISPATCHED,
  ResourceStatus.EN_ROUTE,
  ResourceStatus.ON_SCENE,
  ResourceStatus.TRANSPORTING,
  ResourceStatus.RETURNING,
];

/**
 * The statuses a Dispatcher or Supervisor may set on the fleet board, and only while
 * the unit has no active dispatch (PATCH /resources/:id/status).
 */
export const MANUAL_RESOURCE_STATUSES: readonly ResourceStatus[] = [
  ResourceStatus.AVAILABLE,
  ResourceStatus.OUT_OF_SERVICE,
  ResourceStatus.OFFLINE,
  ResourceStatus.RESERVED,
];

/** Not usable for dispatch (maintenance, breakdown, no contact). */
export const UNAVAILABLE_RESOURCE_STATUSES: readonly ResourceStatus[] = [
  ResourceStatus.OUT_OF_SERVICE,
  ResourceStatus.OFFLINE,
];
