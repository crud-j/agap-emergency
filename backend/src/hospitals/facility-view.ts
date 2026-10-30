import type { TransportDestinationView } from '@agap/shared';

const DECIMAL_FIELDS = ['latitude', 'longitude', 'location_confidence'] as const;
type DecimalField = (typeof DECIMAL_FIELDS)[number];

export type FacilityView<T> = Omit<T, 'location' | DecimalField> & { [K in DecimalField & keyof T]: number | null };

/**
 * A facility as it leaves the API (MOD-39): Prisma Decimals become JSON numbers
 * and the unreadable `location` geography is dropped. Only fields present on the
 * input are converted, so a narrow select stays narrow.
 */
export function toFacilityView<T extends object>(facility: T): FacilityView<T> {
  const { location: _location, ...view } = facility as T & { location?: unknown };
  const fields = view as Record<string, unknown>;
  for (const key of DECIMAL_FIELDS) {
    if (key in fields) fields[key] = fields[key] == null ? null : Number(fields[key]);
  }
  return view as unknown as FacilityView<T>;
}

/** The facility fields a transport destination view needs. */
export const DESTINATION_VIEW_SELECT = {
  name: true,
  latitude: true,
  longitude: true,
  location_status: true,
} as const;

/** A transport destination as clients draw it (MOD-40): numeric coordinates, verified flag. */
export function toTransportDestinationView(facility: {
  name: string;
  latitude: unknown;
  longitude: unknown;
  location_status: string;
}): TransportDestinationView {
  const view = toFacilityView(facility);
  return {
    kind: 'FACILITY',
    name: view.name,
    latitude: view.latitude,
    longitude: view.longitude,
    locationVerified: view.location_status === 'VERIFIED',
  };
}
