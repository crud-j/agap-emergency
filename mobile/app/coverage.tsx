import React, { Component, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/src/stores/auth.store';
import { getMapConfig } from '@/src/services/api/locations.api';
import { isNativeMapAvailable } from '@/src/components/tracking/native-map-available';

// Lazy so the MapLibre native module is imported only when it exists — a stale dev
// client / Expo Go falls back to a placeholder instead of a hard native crash.
const BocaueScopedMap = React.lazy(
  () => import('@/src/components/tracking/bocaue-scoped-map'),
);

// ─── MapLibre render guard ──────────────────────────────────────────────────

class MapErrorBoundary extends Component<
  { children: React.ReactNode; onReset?: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) {
      return (
        <View style={styles.fallback}>
          <Ionicons name="map-outline" size={36} color="#8795A3" />
          <Text style={styles.fallbackText}>Map failed to render on this device.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => this.props.onReset?.()}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

/**
 * Bocaue coverage view — renders only the municipality-scoped map. Panning and zoom
 * are locked to Bocaue by <BocaueScopedMap> (maxBounds + min/max zoom on the camera).
 */
export default function CoverageScreen() {
  const router = useRouter();
  const token = useAuthStore((s) => s.accessToken);
  const mapAvailable = useMemo(() => isNativeMapAvailable(), []);
  const [boundaryKey, setBoundaryKey] = useState(0);

  const { data: mapConfig } = useQuery({
    queryKey: ['map-config'],
    queryFn: () => getMapConfig(token ?? undefined),
    enabled: mapAvailable,
    staleTime: 5 * 60 * 1000,
    retry: false,
    gcTime: 30 * 60 * 1000,
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F2F5F8" />

      {mapAvailable ? (
        <MapErrorBoundary key={boundaryKey} onReset={() => setBoundaryKey((k) => k + 1)}>
          <React.Suspense
            fallback={
              <View style={styles.fallback}>
                <ActivityIndicator color="#0D6053" />
              </View>
            }
          >
            <BocaueScopedMap styleUrl={mapConfig?.styleUrl ?? undefined} />
          </React.Suspense>
        </MapErrorBoundary>
      ) : (
        <View style={styles.fallback}>
          <Ionicons name="map-outline" size={36} color="#8795A3" />
          <Text style={styles.fallbackText}>Live map requires the latest app build.</Text>
        </View>
      )}

      {/* Floating header — back button + title chip, overlaid on the map */}
      <SafeAreaView edges={['top']} style={styles.headerSafe} pointerEvents="box-none">
        <View style={styles.header} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={20} color="#0D6053" />
          </TouchableOpacity>
          <View style={styles.titleChip}>
            <Ionicons name="location" size={13} color="#0D6053" />
            <Text style={styles.titleText}>Bocaue, Bulacan</Text>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F5F8' },

  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#EDF1F4' },
  fallbackText: { color: '#8795A3', fontSize: 13, fontWeight: '500' },
  retryBtn: { marginTop: 12, backgroundColor: '#0D6053', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 11 },
  retryText: { color: '#FFFFFF', fontWeight: '700' },

  headerSafe: { position: 'absolute', top: 0, left: 0, right: 0 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 10 },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  titleChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#FFFFFF', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  titleText: { fontSize: 13, fontWeight: '700', color: '#1C2B3A' },
});
