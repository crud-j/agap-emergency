import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Language = 'en' | 'fil';

interface AccessibilityState {
  language: Language;
  setLanguage: (lang: Language) => void;
}

// skipHydration prevents SSR/client mismatch in Next.js.
// Components must call useAccessibilityStore.persist.rehydrate() in a useEffect.
export const useAccessibilityStore = create<AccessibilityState>()(
  persist(
    (set) => ({
      language: 'en' as Language,
      setLanguage: (language) => set({ language }),
    }),
    {
      name: 'agap_ops_prefs',
      skipHydration: true,
    },
  ),
);
