import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { MapProvider } from '@agap/shared';
import { getIncidentStatus } from '@/src/services/api/incidents.api';
import { getMapConfig } from '@/src/services/api/locations.api';
import { useAuthStore } from '@/src/stores/auth.store';
import { useIncidentTracking } from '@/src/hooks/useIncidentTracking';
import { useRouteLine } from '@/src/hooks/useRouteLine';
import type { LatLngLite } from '@/src/components/tracking/live-tracking-map';
import { isNativeMapAvailable } from '@/src/components/tracking/native-map-available';

// Lazy-loaded so the MapLibre native module (which needs a dev build) is imported
// only when the map actually renders — and only when the native module exists, so
// a stale dev client / Expo Go falls back to a placeholder instead of crashing.
const LiveTrackingMap = React.lazy(() => import('@/src/components/tracking/live-tracking-map'));
const MAP_AVAILABLE = isNativeMapAvailable();

const MAPLIBRE_DEMO_STYLE = 'https://demotiles.maplibre.org/style.json';

interface IncidentLite {
  public_reference: string;
  status: string;
  category: string;
  incident_locations: { latitude: string | number; longitude: string | number } | null;
}

/**
 * Citizen-facing live incident tracking (MOD-42 / MOD-43). Shows the live status,
 * the responder's ETA, and a map with the incident pin and the ambulance moving
 * toward it, all updated over the WebSocket. ETA is always labeled an estimate.
 */
export default function TrackingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const token = useAuthStore((s) => s.accessToken);

  const { data: incident, isLoading } = useQuery({
    queryKey: ['tracking-incident', id],
    queryFn: () => getIncidentStatus(id as string, token ?? undefined) as Promise<IncidentLite>,
    enabled: !!id,
  });

  const { data: mapConfig } = useQuery({
    queryKey: ['map-config'],
    queryFn: () => getMapConfig(token ?? undefined),
    staleTime: 5 * 60 * 1000,
  });

  const live = useIncidentTracking(id, incident?.status ?? null);

  const loc = incident?.incident_locations ?? null;
  const incidentPoint: LatLngLite | null =
    loc != null ? { lat: Number(loc.latitude), lng: Number(loc.longitude) } : null;
  const responderPoint: (LatLngLite & { heading?: number }) | null = live.responder
    ? {
        lat: live.responder.lat,
        lng: live.responder.lng,
        ...(live.responder.heading != null ? { heading: live.responder.heading } : {}),
      }
    : null;

  // Draw the responder's route to the scene when both points are known.
  const route = useRouteLine(
    MAP_AVAILABLE ? responderPoint : null,
    MAP_AVAILABLE ? incidentPoint : null,
  );

  // Mapbox styles use mapbox:// sources that MapLibre can't resolve, so only use
  // a styleUrl when the provider is MapLibre; otherwise the OSS demo style.
  const styleUrl =
    mapConfig?.provider === MapProvider.MAPLIBRE && mapConfig.styleUrl
      ? mapConfig.styleUrl
      : MAPLIBRE_DEMO_STYLE;

  const status = live.status ?? incident?.status ?? '—';

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Live Tracking</Text>
        <View style={styles.headerRight}>
          <View style={[styles.dot, { backgroundColor: live.connected ? '#16A34A' : '#9CA3AF' }]} />
          {id && (
            <TouchableOpacity
              onPress={() => router.push(`/incident/chat/${id}`)}
              style={styles.iconBtn}
              accessibilityLabel="Incident chat"
            >
              <Ionicons name="chatbubbles-outline" size={22} color="#0D6053" />
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>

      <View style={styles.mapWrap}>
        {isLoading ? (
          <View style={styles.mapFallback}>
            <ActivityIndicator color="#0D6053" />
          </View>
        ) : !MAP_AVAILABLE ? (
          <View style={styles.mapFallback}>
            <Ionicons name="map-outline" size={40} color="#9CA3AF" />
            <Text style={styles.mapFallbackText}>Live map requires the latest app build.</Text>
          </View>
        ) : (
          <MapErrorBoundary>
            <React.Suspense
              fallback={
                <View style={styles.mapFallback}>
                  <ActivityIndicator color="#0D6053" />
                </View>
              }
            >
              <LiveTrackingMap
                styleUrl={styleUrl}
                incident={incidentPoint}
                responder={responderPoint}
                routeGeometry={route.geometry}
              />
            </React.Suspense>
          </MapErrorBoundary>
        )}
      </View>

      <View style={styles.sheet}>
        {incident?.public_reference ? (
          <Text style={styles.reference}>{incident.public_reference}</Text>
        ) : null}

        <View style={styles.statusRow}>
          <View style={styles.statusPill}>
            <Text style={styles.statusPillText}>{formatStatus(status)}</Text>
          </View>
          <Text style={styles.category}>{incident?.category ?? ''}</Text>
        </View>

        <View style={styles.etaCard}>
          <Ionicons name="time-outline" size={22} color="#0D6053" style={{ marginRight: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.etaLabel}>Estimated arrival</Text>
            <Text style={styles.etaValue}>
              {live.etaSeconds != null ? formatEta(live.etaSeconds) : 'Calculating…'}
            </Text>
          </View>
          {live.etaSeconds != null && <Text style={styles.estimateTag}>estimate</Text>}
        </View>

        {responderPoint ? (
          <View style={styles.hintRow}>
            <Ionicons name="medkit" size={14} color="#0D6053" style={{ marginRight: 6 }} />
            <Text style={styles.hint}>Responder is on the way — tracking live.</Text>
          </View>
        ) : (
          <View style={styles.hintRow}>
            <Ionicons name="information-circle-outline" size={14} color="#6B7280" style={{ marginRight: 6 }} />
            <Text style={styles.hint}>Waiting for a responder to be dispatched.</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function formatStatus(s: string): string {
  return s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

function formatEta(seconds: number): string {
  const mins = Math.max(1, Math.round(seconds / 60));
  return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} hr ${mins % 60} min`;
}

/**
 * Keeps the native map from breaking the screen. Before a dev build that includes
 * the MapLibre native module, rendering throws — we fall back to a placeholder so
 * the live status/ETA below still work.
 */
class MapErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return (
        <View style={styles.mapFallback}>
          <Ionicons name="map-outline" size={40} color="#9CA3AF" />
          <Text style={styles.mapFallbackText}>Live map requires the latest app build.</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingBottom: 8, backgroundColor: '#FFFFFF',
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  connDot: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },

  mapWrap: { flex: 1, backgroundColor: '#E5E7EB' },
  mapFallback: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  mapFallbackText: { marginTop: 8, fontSize: 13, color: '#6B7280', textAlign: 'center', paddingHorizontal: 24 },

  sheet: {
    backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 28,
    borderTopLeftRadius: 20, borderTopRightRadius: 20, marginTop: -20,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: -2 }, elevation: 8,
  },
  reference: { fontSize: 12, fontFamily: 'monospace', color: '#6B7280', marginBottom: 10 },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  statusPill: { backgroundColor: '#E6F2EF', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6, marginRight: 10 },
  statusPillText: { color: '#0D6053', fontSize: 13, fontWeight: '700' },
  category: { color: '#6B7280', fontSize: 13 },

  etaCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F9FAFB', borderRadius: 14, padding: 16,
  },
  etaLabel: { fontSize: 12, color: '#6B7280' },
  etaValue: { fontSize: 20, fontWeight: '800', color: '#111827' },
  estimateTag: { fontSize: 10, color: '#9CA3AF', fontStyle: 'italic' },

  hintRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  hint: { fontSize: 12, color: '#6B7280', flexShrink: 1 },
});
