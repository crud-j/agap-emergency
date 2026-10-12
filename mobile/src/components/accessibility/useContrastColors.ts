import { useAccessibilityStore } from '../../stores/accessibility.store';

/**
 * MOD-04 — returns a small palette that flips to high-contrast values when the
 * user enables High Contrast. Screens use these instead of hardcoding greys so
 * low-vision users get sufficient contrast without a separate theme.
 */
export interface ContrastPalette {
  highContrast: boolean;
  textPrimary: string;
  textMuted: string;
  surface: string;
  border: string;
  accent: string;
}

const NORMAL: ContrastPalette = {
  highContrast: false,
  textPrimary: '#111827',
  textMuted: '#6B7280',
  surface: '#FFFFFF',
  border: '#EEF2F6',
  accent: '#0D6053',
};

const HIGH: ContrastPalette = {
  highContrast: true,
  textPrimary: '#000000',
  textMuted: '#1F2937',
  surface: '#FFFFFF',
  border: '#111827',
  accent: '#0A443F',
};

export function useContrastColors(): ContrastPalette {
  const highContrast = useAccessibilityStore((s) => s.highContrast);
  return highContrast ? HIGH : NORMAL;
}
