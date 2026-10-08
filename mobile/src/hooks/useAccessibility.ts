import { useAccessibilityStore } from '../stores/accessibility.store';
import { en, fil } from '../i18n/translations';
import type { Translations } from '../i18n/translations';

// Font scale multipliers per text-size preference
export const FONT_SCALE = { small: 0.875, medium: 1, large: 1.15 } as const;

/**
 * Returns the full translation tree in the user's selected language.
 * Components can destructure what they need: const { login } = useTranslations()
 */
export function useTranslations(): Translations {
  const language = useAccessibilityStore((s) => s.language);
  return language === 'fil' ? fil : en;
}

/**
 * Returns a scale multiplier (0.875 / 1.0 / 1.15) and a helper fn.
 * Usage: const { fs } = useFontScale()
 *        <Text style={{ fontSize: fs(16) }}>
 */
export function useFontScale() {
  const textSize = useAccessibilityStore((s) => s.textSize);
  const scale = FONT_SCALE[textSize];
  return {
    scale,
    fs: (base: number) => Math.round(base * scale),
  };
}
