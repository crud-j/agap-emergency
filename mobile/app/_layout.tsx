import '../global.css';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuthStore } from '../src/stores/auth.store';
import { useAccessibilityStore } from '../src/stores/accessibility.store';
import { homeRouteForRole } from '../src/lib/role-routing';
import { OfflineBanner } from '../src/components/ui/OfflineBanner';
import {
  assignmentIdFromNotification,
  incidentIdFromNotification,
  registerPushToken,
} from '../src/services/push/push-registration';
import { useLiveIncidentRefresh } from '../src/hooks/useLiveIncidentRefresh';
import { AgapSplash } from '../src/components/splash/AgapSplash';

// Wire React Native's AppState into TanStack Query's focus manager so
// refetchOnWindowFocus works when the app comes back to the foreground.
focusManager.setEventListener((handleFocus) => {
  const sub = AppState.addEventListener('change', (state) => {
    handleFocus(state === 'active');
  });
  return () => sub.remove();
});

// Show pushes while the app is open too; iOS shows nothing otherwise.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

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

const PUBLIC_SEGMENTS = ['auth', 'onboarding', 'emergency'];
const AUTH_ONLY_SEGMENTS = ['auth', 'onboarding'];

function AuthGuard() {
  const router = useRouter();
  const segments = useSegments();
  const { isAuthenticated, isLoading, loadFromStorage } = useAuthStore();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const loadAccessibility = useAccessibilityStore((s) => s.loadFromStorage);
  const accessibilityLoaded = useAccessibilityStore((s) => s.isLoaded);

  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;
    void registerPushToken(accessToken);
  }, [accessToken, isAuthenticated]);

  // Home, history, SOS and responder tabs refetch when an incident changes.
  useLiveIncidentRefresh();

  useEffect(() => {
    loadFromStorage();
    loadAccessibility();
  }, []);

  useEffect(() => {
    // Wait until both SecureStore and accessibility prefs have been read.
    if (isLoading || !accessibilityLoaded) return;

    // Typed routes declare segments as a non-empty tuple, but at the app root it
    // is [] at runtime — widen the type so this check isn't flagged as impossible.
    const atRoot   = (segments as string[]).length === 0;
    const inPublic = PUBLIC_SEGMENTS.some((s) => segments[0] === s);
    const inAuthOnly = AUTH_ONLY_SEGMENTS.some((s) => segments[0] === s);

    if (isAuthenticated) {
      // Authenticated users can still enter the emergency flow from home.
      // Only redirect away from auth/onboarding screens, not emergency routes.
      if (atRoot || inAuthOnly) {
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

  // A tapped push opens its assignment (responder) or incident. Held until the session
  // is loaded, and declared after the redirect above so a cold start lands home → target.
  const [tapped, setTapped] = useState<{ pathname: string; id: string } | null>(null);
  const handledResponses = useRef(new Set<string>());

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const take = (response: Notifications.NotificationResponse | null) => {
      const key = response?.notification.request.identifier;
      if (!key || handledResponses.current.has(key)) return;
      // Assignment first: its param is the dispatch ID, not an incident ID.
      const dispatchId = assignmentIdFromNotification(response);
      const incidentId = dispatchId ? null : incidentIdFromNotification(response);
      if (!dispatchId && !incidentId) return;
      handledResponses.current.add(key);
      setTapped(
        dispatchId
          ? { pathname: '/responder/assignment/[id]', id: dispatchId }
          : { pathname: '/incidents/[id]', id: incidentId! },
      );
    };
    take(Notifications.getLastNotificationResponse());
    const sub = Notifications.addNotificationResponseReceivedListener(take);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!tapped || isLoading || !accessibilityLoaded || !isAuthenticated) return;
    router.push({ pathname: tapped.pathname, params: { id: tapped.id } } as never);
    setTapped(null);
  }, [tapped, isAuthenticated, isLoading, accessibilityLoaded]);

  return null;
}

// Shown once per cold start, over the router, so AuthGuard can route to
// onboarding (or home) underneath while the animation plays.
function LaunchSplash() {
  const [done, setDone] = useState(false);
  const authLoading = useAuthStore((s) => s.isLoading);
  const accessibilityLoaded = useAccessibilityStore((s) => s.isLoaded);
  const reducedMotion = useAccessibilityStore((s) => s.reducedMotion);

  if (done) return null;
  return (
    <AgapSplash
      ready={!authLoading && accessibilityLoaded}
      reducedMotion={accessibilityLoaded && reducedMotion}
      onFinish={() => setDone(true)}
    />
  );
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
            <Stack.Screen name="archive/index" options={{ animation: 'none' }} />
            <Stack.Screen name="profile/index" options={{ animation: 'none' }} />
          </Stack>
          {/* Global offline indicator — position:absolute overlay, never blocks taps */}
          <OfflineBanner />
          <LaunchSplash />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
