import { citizenIconKind, type CitizenIconKind } from '@agap/shared';

/**
 * Web map marker images (WP4). Served from /public/map-icons as 128 px copies of
 * the mobile artwork — full-size PNGs in dozens of DOM markers hurt frame rate.
 * Selection rules live in @agap/shared so every map picks icons the same way.
 */
export const AMBULANCE_ICON_URL = '/map-icons/ambulance.png';

const CITIZEN_ICON_URL: Record<CitizenIconKind, string> = {
  male: '/map-icons/citizen-male.png',
  female: '/map-icons/citizen-female.png',
};

/** Reporter icon URL, or null → render the neutral priority pin. */
export function citizenIconFor(sex: string | null | undefined): string | null {
  const kind = citizenIconKind(sex);
  return kind ? CITIZEN_ICON_URL[kind] : null;
}
