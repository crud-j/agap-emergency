import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Stack, useRouter, usePathname } from 'expo-router';
import { UserRole } from '@agap/shared';
import { useAuthStore } from '@/src/stores/auth.store';
import { homeRouteForRole } from '@/src/lib/role-routing';
import { ResponderNav } from '@/src/components/responder/responder-nav';

// The four routes that show the shell nav. Nested operational screens do not.
const SHELL_TABS = new Set([
  '/responder/home',
  '/responder/assignments',
  '/responder/map',
  '/responder/profile',
]);

export default function ResponderLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const isLoading = useAuthStore((s) => s.isLoading);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace('/auth/login' as never);
      return;
    }
    if (user && user.role !== UserRole.RESPONDER) {
      router.replace(homeRouteForRole(user.role) as never);
    }
  }, [isLoading, isAuthenticated, user?.role]);

  const showNav = SHELL_TABS.has(pathname);

  return (
    <View style={styles.root}>
      <Stack screenOptions={{ headerShown: false }}>
        {/* Tab screens swap instantly — no slide animation */}
        <Stack.Screen name="home" options={{ animation: 'none' }} />
        <Stack.Screen name="assignments" options={{ animation: 'none' }} />
        <Stack.Screen name="map" options={{ animation: 'none' }} />
        <Stack.Screen name="profile" options={{ animation: 'none' }} />
        {/* Nested operational screens keep default Stack slide animation */}
      </Stack>
      {showNav && <ResponderNav />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F2F5F8' },
});
