import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { getIncidentStatus } from '@/src/services/api/incidents.api';
import { getMapConfig } from '@/src/services/api/locations.api';
import { useAuthStore } from '@/src/stores/auth.store';
import { useIncidentTracking } from '@/src/hooks/useIncidentTracking';
import { useRouteLine } from '@/src/hooks/useRouteLine';
import type { LatLngLite } from '@/src/components/tracking/live-tracking-map';
import { isNativeMapAvailable } from '@/src/components/tracking/native-map-available';
import { AgapLogo } from '@/src/components/brand/AgapLogo';
import { colors, cardShadow, radius } from '@/src/theme/tokens';
import { isSignalLost } from '@agap/shared';

// Lazy-loaded so the MapLibre native module (which needs a dev build) is imported
// only when the map actually renders — and only when the native module exists, so
// a stale dev client / Expo Go falls back to a placeholder instead of crashing.
const LiveTrackingMap = React.lazy(() => Promise.resolve({
  default: require('../../src/components/tracking/live-tracking-map').default as typeof import('../../src/components/tracking/live-tracking-map').default,
}));
const MAP_AVAILABLE = isNativeMapAvailable();

// Keyless OpenFreeMap fallback — real OSM streets at municipal zoom (the old
// maplibre.org demo tiles were blank at Bocaue). Used only when the backend
// map-config returns no styleUrl.
const MAPLIBRE_DEMO_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

interface IncidentLite {
  public_reference: string;
  status: string;
  category: string;
  priority?: string | null;
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
  const user = useAuthStore((s) => s.user);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  const { data: incident, isLoading } = useQuery({
    queryKey: ['tracking-incident', id],
    queryFn: () => getIncidentStatus(id as string, token ?? undefined) as Promise<IncidentLite>,
    enabled: !!id,
  });

  // Only needed when the map can actually render. Skipping saves a network
  // round-trip (+ up to 3 retries) whenever the native module is absent.
  const { data: mapConfig } = useQuery({
    queryKey: ['map-config'],
    queryFn: () => getMapConfig(token ?? undefined),
    enabled: MAP_AVAILABLE,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const live = useIncidentTracking(id, incident?.status ?? null);

  const loc = incident?.incident_locations ?? null;
  const incidentPoint: LatLngLite | null =
    loc != null ? { lat: Number(loc.latitude), lng: Number(loc.longitude) } : null;
  const responderPoint: (LatLngLite & { heading?: number; updatedAt?: string }) | null = live.responder
    ? {
        lat: live.responder.lat,
        lng: live.responder.lng,
        ...(live.responder.heading != null ? { heading: live.responder.heading } : {}),
        updatedAt: live.responder.updatedAt,
      }
    : null;
  const citizenSex = user?.sex === 'MALE' || user?.sex === 'FEMALE' ? user.sex : null;
  const responderSignalLost = live.responder
    ? isSignalLost(live.responder.updatedAt, now)
    : false;
  const responderAgeSeconds = live.responder
    ? Math.max(0, Math.floor((now - Date.parse(live.responder.updatedAt)) / 1000))
    : null;

  // Draw the responder's route to the scene when both points are known.
  const route = useRouteLine(
    MAP_AVAILABLE ? responderPoint : null,
    MAP_AVAILABLE ? incidentPoint : null,
  );

  // Use any non-null styleUrl from the backend; fall back to demo only when null.
  // (The provider check was removed — Mapbox styleUrls now correctly return null
  //  since mapbox:// sources are not resolvable by @maplibre/maplibre-react-native.)
  const styleUrl = mapConfig?.styleUrl ?? MAPLIBRE_DEMO_STYLE;

  const status = live.status ?? incident?.status ?? '—';
  // Responders are on scene or finished — an arrival estimate no longer applies.
  const arrived = ['ON_SCENE', 'TRANSPORTING', 'ASSISTING'].includes(status);
  const helpComplete = status === 'RESOLVED' || status === 'CLOSED';

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.header}>
        <TouchableOpacity onPress={() => router.replace('/incidents')} style={styles.iconBtn} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <AgapLogo width={132} height={44} />
        <View style={styles.headerRight}>
          <View
            style={[styles.dot, { backgroundColor: live.connected ? colors.primary : colors.textSub }]}
            accessibilityLabel={live.connected ? 'Connected' : 'Offline'}
          />
          {id && (
            <TouchableOpacity
              onPress={() => router.push(`/incident/chat/${id}`)}
              style={styles.iconBtn}
              accessibilityLabel="Incident chat"
            >
              <Ionicons name="chatbubbles-outline" size={22} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>

      <View style={styles.mapWrap}>
        {isLoading ? (
          <View style={styles.mapFallback}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : !MAP_AVAILABLE ? (
          <View style={styles.mapFallback}>
            <Ionicons name="map-outline" size={40} color={colors.textSub} />
            <Text style={styles.mapFallbackText}>Live map requires the latest app build.</Text>
          </View>
        ) : (
          <MapErrorBoundary>
            <React.Suspense
              fallback={
                <View style={styles.mapFallback}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              }
            >
              <LiveTrackingMap
                styleUrl={styleUrl}
                incident={incidentPoint}
                responder={responderPoint}
                routeGeometry={route.geometry}
                responderIcon="ambulance"
                citizenSex={citizenSex}
                priority={incident?.priority}
                pitch={20}
                supports3dBuildings={mapConfig?.supports3dBuildings ?? false}
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

        {helpComplete ? (
          <View style={styles.etaCard}>
            <Ionicons name="checkmark-done-circle" size={22} color={colors.primary} style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.etaLabel}>Response complete</Text>
              <Text style={styles.etaValue}>
                {status === 'CLOSED' ? 'This incident is closed.' : 'Responders have finished assisting.'}
              </Text>
            </View>
          </View>
        ) : arrived ? (
          <View style={styles.etaCard}>
            <Ionicons name="medkit-outline" size={22} color={colors.primary} style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.etaLabel}>Responders on scene</Text>
              <Text style={styles.etaValue}>{formatStatus(status)}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.etaCard}>
            <Ionicons name="time-outline" size={22} color={colors.primary} style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.etaLabel}>Estimated arrival</Text>
              <Text style={styles.etaValue}>
                {live.etaSeconds != null ? formatEta(live.etaSeconds) : 'Calculating…'}
              </Text>
            </View>
            <Text style={styles.estimateTag}>estimate</Text>
          </View>
        )}

        {live.hasAcceptedDispatch && (
          <View style={styles.unitRow}>
            <Ionicons name="medkit-outline" size={17} color={colors.primary} />
            <Text style={styles.unitName}>
              {live.callSign ? `Call sign ${live.callSign}` : live.unitName ?? 'Response unit'}
            </Text>
          </View>
        )}

        {responderPoint ? (
          <View style={[styles.hintRow, responderSignalLost && styles.signalLostRow]}>
            <Ionicons
              name={responderSignalLost ? 'cloud-offline-outline' : 'navigate'}
              size={14}
              color={responderSignalLost ? colors.textSub : colors.primary}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.hint, responderSignalLost && styles.signalLostText]}>
              {responderSignalLost
                ? 'Responder signal lost — they are still assigned. Call 911 / MDRRMO if urgent.'
                : `Responder last seen ${responderAgeSeconds}s ago.`}
            </Text>
          </View>
        ) : live.hasAcceptedDispatch ? (
          <View style={styles.hintRow}>
            <Ionicons name="time-outline" size={14} color={colors.amber} style={{ marginRight: 6 }} />
            <Text style={styles.hint}>Responder accepted — tracking will start shortly</Text>
          </View>
        ) : (
          <View style={styles.hintRow}>
            <Ionicons name="information-circle-outline" size={14} color={colors.textSub} style={{ marginRight: 6 }} />
            <Text style={styles.hint}>Waiting for a responder to be dispatched.</Text>
          </View>
        )}
        {live.seedFailed && !responderPoint && (
          <View style={[styles.hintRow, styles.seedErrorRow]}>
            <Ionicons name="cloud-offline-outline" size={14} color={colors.danger} style={{ marginRight: 6 }} />
            <Text style={[styles.hint, { color: colors.danger }]}>
              Could not refresh responder tracking. If urgent, call 911 / MDRRMO.
            </Text>
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
          <Ionicons name="map-outline" size={40} color={colors.textSub} />
          <Text style={styles.mapFallbackText}>Live map requires the latest app build.</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingBottom: 8, backgroundColor: colors.white,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 9, height: 9, borderRadius: 5 },

  mapWrap: { flex: 1, backgroundColor: colors.track },
  mapFallback: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  mapFallbackText: { marginTop: 8, fontSize: 13, color: colors.textSub, textAlign: 'center', paddingHorizontal: 24 },

  sheet: {
    backgroundColor: colors.white, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 28,
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, marginTop: -20,
    ...cardShadow,
  },
  reference: { fontSize: 12, fontFamily: 'monospace', color: colors.textSub, marginBottom: 10 },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  statusPill: { backgroundColor: colors.primarySoft, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6, marginRight: 10 },
  statusPillText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  category: { color: colors.textSub, fontSize: 13 },

  etaCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16,
  },
  etaLabel: { fontSize: 12, color: colors.textSub },
  etaValue: { fontSize: 20, fontWeight: '800', color: colors.text },
  estimateTag: { fontSize: 10, color: colors.textSub, fontStyle: 'italic' },

  unitRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  unitName: { fontSize: 13, color: colors.primary, fontWeight: '700' },
  hintRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  hint: { fontSize: 12, color: colors.textSub, flexShrink: 1, lineHeight: 18 },
  signalLostRow: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 10 },
  signalLostText: { color: colors.textSub, fontWeight: '600' },
  seedErrorRow: { backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: 10 },
});
