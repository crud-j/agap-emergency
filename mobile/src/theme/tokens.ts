/**
 * AGAP mobile design tokens.
 *
 * Centralises the palette and shadow vocabulary already used across the home
 * screen and incident status screen so new surfaces stay visually consistent.
 * Values mirror the neumorphic dial treatment: pearl background (#F2F5F8),
 * deep-green primary (#0D6053), and the shared card shadow tone (#8795A3).
 */

export const colors = {
  bg: '#F2F5F8',
  white: '#FFFFFF',

  primary: '#0D6053',
  primarySoft: '#EEF7F4',

  text: '#1C2B3A',
  textMid: '#40536D',
  textSub: '#8795A3',

  danger: '#D44858',
  dangerSoft: '#FDF0F1',

  amber: '#D97706',
  amberSoft: '#FFFBEB',

  info: '#3B82F6',
  infoSoft: '#EFF6FF',

  surface: '#EDF1F4',
  border: 'rgba(168,181,193,0.20)',
  track: '#DCE3E9',
} as const;

export const cardShadow = {
  shadowColor: '#8795A3',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.09,
  shadowRadius: 12,
  elevation: 3,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
} as const;
