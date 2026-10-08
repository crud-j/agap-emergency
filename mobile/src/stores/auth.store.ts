import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { SafeUser, AuthTokens } from '../services/api/auth.api';

// NOTE: expo-secure-store rejects keys that are not /^[\w.-]+$/ (alphanumeric,
// "_", ".", "-"). Colons are INVALID and make setItemAsync throw, which would
// surface here as a failed login even though the backend verified successfully.
// Exported so a unit test can assert every key stays valid for expo-secure-store.
export const KEYS = {
  accessToken: 'agap_access_token',
  refreshToken: 'agap_refresh_token',
  user: 'agap_user',
} as const;

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: SafeUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  loadFromStorage: () => Promise<void>;
  login: (tokens: AuthTokens, user: SafeUser) => Promise<void>;
  updateUser: (partial: Partial<SafeUser>) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  refreshToken: null,
  user: null,
  isLoading: true,
  isAuthenticated: false,

  loadFromStorage: async () => {
    try {
      const [accessToken, refreshToken, userJson] = await Promise.all([
        SecureStore.getItemAsync(KEYS.accessToken),
        SecureStore.getItemAsync(KEYS.refreshToken),
        SecureStore.getItemAsync(KEYS.user),
      ]);
      const user: SafeUser | null = userJson ? JSON.parse(userJson) : null;
      set({
        accessToken,
        refreshToken,
        user,
        isAuthenticated: !!(accessToken && user),
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
    }
  },

  login: async (tokens, user) => {
    await Promise.all([
      SecureStore.setItemAsync(KEYS.accessToken, tokens.accessToken),
      SecureStore.setItemAsync(KEYS.refreshToken, tokens.refreshToken),
      SecureStore.setItemAsync(KEYS.user, JSON.stringify(user)),
    ]);
    set({ ...tokens, user, isAuthenticated: true });
  },

  updateUser: async (partial) => {
    const current = get().user;
    if (!current) return;
    const updated = { ...current, ...partial };
    await SecureStore.setItemAsync(KEYS.user, JSON.stringify(updated));
    set({ user: updated });
  },

  logout: async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(KEYS.accessToken),
      SecureStore.deleteItemAsync(KEYS.refreshToken),
      SecureStore.deleteItemAsync(KEYS.user),
    ]);
    set({ accessToken: null, refreshToken: null, user: null, isAuthenticated: false });
  },
}));
