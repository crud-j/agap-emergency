import '../global.css';
import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAuthStore } from '../src/stores/auth.store';
import { useAccessibilityStore } from '../src/stores/accessibility.store';
import { homeRouteForRole } from '../src/lib/role-routing';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

const PUBLIC_SEGMENTS = ['auth', 'onboarding'];

function AuthGuard() {
  const router = useRouter();
  const segments = useSegments();
  const { isAuthenticated, isLoading, loadFromStorage } = useAuthStore();
  const user = useAuthStore((s) => s.user);
  const loadAccessibility = useAccessibilityStore((s) => s.loadFromStorage);
  const accessibilityLoaded = useAccessibilityStore((s) => s.isLoaded);

  useEffect(() => {
    loadFromStorage();
    loadAccessibility();
  }, []);

  useEffect(() => {
    if (isLoading || !accessibilityLoaded) return;
    const inPublic = PUBLIC_SEGMENTS.some((s) => segments[0] === s);
    if (!isAuthenticated && !inPublic) {
      router.replace('/auth/login');
    } else if (isAuthenticated && inPublic) {
      router.replace(homeRouteForRole(user?.role) as never);
    }
  }, [isAuthenticated, isLoading, accessibilityLoaded, segments, user?.role]);

  return null;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <AuthGuard />
        <Stack screenOptions={{ headerShown: false }}>
          {/* Tab screens swap instantly (no transition) so the bottom nav feels
              like a tab bar rather than a stack push. Other routes keep the
              default animation. */}
          <Stack.Screen name="home/index" options={{ animation: 'none' }} />
          <Stack.Screen name="incidents/index" options={{ animation: 'none' }} />
          <Stack.Screen name="announcements/index" options={{ animation: 'none' }} />
          <Stack.Screen name="profile/index" options={{ animation: 'none' }} />
        </Stack>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
