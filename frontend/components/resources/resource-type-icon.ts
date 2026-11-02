import { Ambulance, Bike, Construction, Flame, Package, RadioTower, Ship, Truck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ResourceType } from '@agap/shared';

const ICONS: Record<ResourceType, LucideIcon> = {
  [ResourceType.AMBULANCE]:            Ambulance,
  [ResourceType.FIRE_TRUCK]:           Flame,
  [ResourceType.RESCUE_TRUCK]:         Truck,
  [ResourceType.RESCUE_BOAT]:          Ship,
  [ResourceType.CLEARING_EQUIPMENT]:   Construction,
  [ResourceType.MOTORCYCLE_RESPONDER]: Bike,
  [ResourceType.COMMAND_VEHICLE]:      RadioTower,
  [ResourceType.OTHER]:                Package,
};

/** The icon for a unit type on the Fleet board and in the Registry. */
export function resourceTypeIcon(type: string): LucideIcon {
  return ICONS[type as ResourceType] ?? Package;
}
