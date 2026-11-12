import type { ImageSourcePropType } from 'react-native';

/**
 * Native map marker images (WP4). `assets/map-icons` holds 48 / 96 / 144 px
 * (@1x/@2x/@3x) copies of the original artwork, trimmed to the figure so it
 * fills a 36–40 px marker. React Native picks the density variant automatically.
 * The reporter's scene marker is their consented profile photo, not an icon.
 */
export const AMBULANCE_ICON: ImageSourcePropType = require('../../assets/map-icons/ambulance.png');
