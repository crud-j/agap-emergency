import { useAccessibilityStore } from '../lib/accessibility.store';
import { en, fil } from '../lib/i18n/translations';
import type { OpsTranslations } from '../lib/i18n/translations';

export function useTranslations(): OpsTranslations {
  const language = useAccessibilityStore((s) => s.language);
  return language === 'fil' ? fil : en;
}
