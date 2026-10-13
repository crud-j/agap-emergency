import '../global.css';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuthStore } from '../src/stores/auth.store';
import { useAccessibilityStore } from '../src/stores/accessibility.store';
import { homeRouteForRole } from '../src/lib/role-routing';
import { useNetworkSync } from '../src/hooks/useNetworkSync';
import { OfflineBanner } from '../src/components/ui/OfflineBanner';

// Wire React Native's AppState into TanStack Query's focus manager so
// refetchOnWindowFocus works when the app comes back to the foreground.
focusManager.setEventListener((handleFocus) => {
  const sub = AppState.addEventListener('change', (state) => {
    handleFocus(state === 'active');
  });
  return () => sub.remove();
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 3 retries with exponential backoff (1 s → 2 s → 4 s) so brief backend
      // startup windows don't permanently strand queries in error state.
      retry: 3,
      retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 10_000),
      staleTime: 30_000,
    },
  },
});

const PUBLIC_SEGMENTS = ['auth', 'onboarding'];

function AuthGuard() {
  const router = useRouter();
  const segments = useSegments();
  const { isAuthenticated, isLoading, loadFromStorage } = useAuthStore();
  const user = useAuthStore((s) => s.user);
  const loadAccessibility = useAccessibilityStore((s) => s.loadFromStorage);
  const accessibilityLoaded = useAccessibilityStore((s) => s.isLoaded);
  useNetworkSync();

  useEffect(() => {
    loadFromStorage();
    loadAccessibility();
  }, []);

  useEffect(() => {
    // Wait until both SecureStore and accessibility prefs have been read.
    if (isLoading || !accessibilityLoaded) return;

    const atRoot   = segments.length === 0;
    const inPublic = PUBLIC_SEGMENTS.some((s) => segments[0] === s);

    if (isAuthenticated) {
      // Move out of the splash root or any public screen (onboarding/auth)
      // and go straight to the role-specific home screen.
      if (atRoot || inPublic) {
        router.replace(homeRouteForRole(user?.role) as never);
      }
    } else {
      if (atRoot) {
        // First-time or logged-out user at root → begin onboarding.
        router.replace('/onboarding/first-onbrd');
      } else if (!inPublic) {
        // Unauthenticated user tried to access a protected route → login.
        router.replace('/auth/login');
      }
    }
  }, [isAuthenticated, isLoading, accessibilityLoaded, segments, user?.role]);

  return null;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthGuard />
          <Stack screenOptions={{ headerShown: false }}>
            {/* Tab screens swap instantly (no transition) so the bottom nav feels
                like a tab bar rather than a stack push. Other routes keep the
                default animation. */}
            <Stack.Screen name="home/index" options={{ animation: 'none' }} />
            <Stack.Screen name="incidents/index" options={{ animation: 'none' }} />
            <Stack.Screen name="announcements/index" options={{ animation: 'none' }} />
            <Stack.Screen name="announcements/[id]" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="announcements/subscribe" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="profile/index" options={{ animation: 'none' }} />
          </Stack>
          {/* Global offline indicator — position:absolute overlay, never blocks taps */}
          <OfflineBanner />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
