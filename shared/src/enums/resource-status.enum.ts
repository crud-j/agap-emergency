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

/** Not usable for dispatch (maintenance, breakdown, no contact). */
export const UNAVAILABLE_RESOURCE_STATUSES: readonly ResourceStatus[] = [
  ResourceStatus.OUT_OF_SERVICE,
  ResourceStatus.OFFLINE,
];
