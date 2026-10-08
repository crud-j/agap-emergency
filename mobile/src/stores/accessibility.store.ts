import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

const STORE_KEY = 'agap_accessibility_prefs';

export type Language = 'en' | 'fil';
export type TextSize = 'small' | 'medium' | 'large';

export interface AccessibilityPrefs {
  language: Language;
  textSize: TextSize;
  highContrast: boolean;
  reducedMotion: boolean;
}

interface AccessibilityState extends AccessibilityPrefs {
  isLoaded: boolean;
  loadFromStorage: () => Promise<void>;
  setPreferences: (prefs: Partial<AccessibilityPrefs>) => Promise<void>;
}

const DEFAULTS: AccessibilityPrefs = {
  language: 'fil',
  textSize: 'medium',
  highContrast: false,
  reducedMotion: false,
};

export const useAccessibilityStore = create<AccessibilityState>((set, get) => ({
  ...DEFAULTS,
  isLoaded: false,

  loadFromStorage: async () => {
    try {
      const raw = await SecureStore.getItemAsync(STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AccessibilityPrefs>;
        set({ ...DEFAULTS, ...parsed, isLoaded: true });
      } else {
        set({ isLoaded: true });
      }
    } catch {
      set({ isLoaded: true });
    }
  },

  setPreferences: async (prefs) => {
    // Functional updater guarantees we merge against the latest state,
    // and the synchronous set() triggers the re-render immediately.
    set((state) => ({
      language: prefs.language ?? state.language,
      textSize: prefs.textSize ?? state.textSize,
      highContrast: prefs.highContrast ?? state.highContrast,
      reducedMotion: prefs.reducedMotion ?? state.reducedMotion,
    }));
    // Persist after the state is already updated
    const { language, textSize, highContrast, reducedMotion } = get();
    try {
      await SecureStore.setItemAsync(
        STORE_KEY,
        JSON.stringify({ language, textSize, highContrast, reducedMotion }),
      );
    } catch {
      // SecureStore unavailable (e.g. web/simulator without native module)
    }
  },
}));
