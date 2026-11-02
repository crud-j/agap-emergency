/**
 * The kind of response unit (MOD-27). Mirrors the `resource_type` enum in
 * backend/prisma/schema.prisma; a backend test fails if the two drift apart.
 */
export enum ResourceType {
  AMBULANCE = 'AMBULANCE',
  RESCUE_BOAT = 'RESCUE_BOAT',
  FIRE_TRUCK = 'FIRE_TRUCK',
  RESCUE_TRUCK = 'RESCUE_TRUCK',
  CLEARING_EQUIPMENT = 'CLEARING_EQUIPMENT',
  MOTORCYCLE_RESPONDER = 'MOTORCYCLE_RESPONDER',
  COMMAND_VEHICLE = 'COMMAND_VEHICLE',
  OTHER = 'OTHER',
}
