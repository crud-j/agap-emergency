import type { ImageSourcePropType } from 'react-native';
import { citizenIconKind, type CitizenIconKind } from '@agap/shared';

/**
 * Native map marker images (WP4). `assets/map-icons` holds 48 / 96 / 144 px
 * (@1x/@2x/@3x) copies of the original artwork, trimmed to the figure so it
 * fills a 36–40 px marker. React Native picks the density variant automatically.
 * Selection rules live in @agap/shared so every map picks icons the same way.
 */
export const AMBULANCE_ICON: ImageSourcePropType = require('../../assets/map-icons/ambulance.png');

const CITIZEN_ICON: Record<CitizenIconKind, ImageSourcePropType> = {
  male: require('../../assets/map-icons/citizen-male.png'),
  female: require('../../assets/map-icons/citizen-female.png'),
};

/** Reporter icon, or null → render the neutral incident pin. */
export function citizenIconFor(sex: string | null | undefined): ImageSourcePropType | null {
  const kind = citizenIconKind(sex);
  return kind ? CITIZEN_ICON[kind] : null;
}
