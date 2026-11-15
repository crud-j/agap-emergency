import React, { Component, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/src/stores/auth.store';
import { getMapConfig } from '@/src/services/api/locations.api';
import { useResponderAssignments } from '@/src/hooks/useResponderAssignments';
import { useResponderLocationShare } from '@/src/hooks/useResponderLocationShare';
import { useTransportRoute } from '@/src/hooks/useTransportRoute';
import { useTranslations } from '@/src/hooks/useAccessibility';
import { useReporterPhotoUri } from '@/src/hooks/useReporterPhoto';
import { isNativeMapAvailable } from '@/src/components/tracking/native-map-available';
import type { LatLngLite } from '@/src/components/tracking/live-tracking-map';
import { shouldShareLocation } from '@/src/lib/assignment-progress';
import { formatDistance, formatDuration } from '@/src/lib/transport-target';
import { ResponderHeader } from '@/src/components/responder/responder-header';
import { TransportBanners } from '@/src/components/responder/transport-banners';
import { Notice, PressScale, StatePanel } from '@/src/components/responder/ui';
import { IncidentTypeIcon } from '@/src/components/incidents/incident-type-icon';
import { colors, radius } from '@/src/theme/tokens';

const LiveTrackingMap = React.lazy(
  () => Promise.resolve({
    default: require('../../src/components/tracking/live-tracking-map').default as typeof import('../../src/components/tracking/live-tracking-map').default,
  }),
);

// Keyless OpenFreeMap fallback — real OSM streets at municipal zoom (the old
// maplibre.org demo tiles were blank at Bocaue). Used only when the backend
// map-config returns no styleUrl.
const MAPLIBRE_DEMO_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

const CARD_SHADOW = {
  shadowColor: '#8795A3',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.09,
  shadowRadius: 12,
  elevation: 3,
};

const BEVEL = 'rgba(168,181,193,0.20)';

// ─── Error boundary for MapLibre ─────────────────────────────────────────────

class MapErrorBoundary extends Component<
  { children: React.ReactNode; onReset?: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) {
      return (
        <View style={styles.mapFallback}>
          <Ionicons name="map-outline" size={36} color="#8795A3" />
          <Text style={styles.muted}>Map failed to render on this device.</Text>
          <TouchableOpacity
            style={styles.boundaryRetryBtn}
            onPress={() => this.props.onReset?.()}
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

// ─── Main screen ──────────────────────────────────────────────────────────────

/**
 * Responder Map tab (MOD-32 / MOD-43). Shows the active assignment destination,
 * responder live position, and route geometry. Location sharing starts once the
 * crew has accepted (same rule as the assignment screen — see
 * `shouldShareLocation`) and stops when the incident reaches a terminal status.
 * During transport the route and destination are the hospital (useTransportRoute,
 * the same rule as the assignment screen).
 */
export default function MapScreen() {
  const router = useRouter();
  const token  = useAuthStore((s) => s.accessToken);
  const t      = useTranslations().transport;

  const mapAvailable = useMemo(() => isNativeMapAvailable(), []);
  const [boundaryKey, setBoundaryKey] = useState(0);

  const {
    activeAssignments,
    acceptedAwaitingProgressAssignments,
    unclassifiedAssignments,
    isLoading,
    isError,
    hasData,
    isStale,
    refetch,
  } = useResponderAssignments();

  const { data: mapConfig } = useQuery({
    queryKey: ['map-config'],
    queryFn: () => getMapConfig(token ?? undefined),
    enabled: mapAvailable,
    staleTime: 5 * 60 * 1000,
    retry: false,
    gcTime: 30 * 60 * 1000,
  });

  const isActive          = activeAssignments.length > 0;
  const primaryAssignment =
    activeAssignments[0] ?? acceptedAwaitingProgressAssignments[0] ?? null;

  // Accepted + incident not terminal → share with the citizen. Identical rule to
  // the assignment screen so the two never disagree about visibility.
  const canShare =
    !!primaryAssignment?.incident_id &&
    shouldShareLocation(primaryAssignment.status, primaryAssignment.incidents?.status);
  const share = useResponderLocationShare(
    canShare ? primaryAssignment?.incident_id : undefined,
    canShare,
  );

  const responderPoint: (LatLngLite & { heading?: number; updatedAt?: string }) | null = share.myPosition
    ? {
        lat: share.myPosition.lat,
        lng: share.myPosition.lng,
        ...(share.myPosition.heading != null ? { heading: share.myPosition.heading } : {}),
        updatedAt: share.myPosition.updatedAt,
      }
    : null;

  const loc         = primaryAssignment?.incidents?.incident_locations;
  const destination: LatLngLite | null =
    loc?.latitude != null && loc?.longitude != null
      ? { lat: Number(loc.latitude), lng: Number(loc.longitude) }
      : null;

  const incidentStatus = primaryAssignment?.incidents?.status ?? null;
  // The reporter's photo, only with their consent and while the incident is active.
  const reporterPhotoUri = useReporterPhotoUri(
    primaryAssignment?.incident_id,
    primaryAssignment?.incidents?.reporter_has_photo,
  );
  const transport = useTransportRoute({
    dispatchId: primaryAssignment?.id,
    incidentId: primaryAssignment?.incident_id,
    incidentStatus,
    scene: destination,
    myPoint: responderPoint,
    enabled: mapAvailable && canShare,
  });
  const { route, target } = transport;
  const openTransport =
    transport.myTransport && !transport.myTransport.arrived_at ? transport.myTransport : null;
  const transporting = incidentStatus === 'TRANSPORTING' && !!openTransport;
  const etaText =
    route.durationSeconds == null
      ? null
      : target.kind === 'FACILITY' && target.label
        ? t.etaToHospital(formatDistance(route.distanceMeters), formatDuration(route.durationSeconds), target.label)
        : t.etaToScene(formatDistance(route.distanceMeters), formatDuration(route.durationSeconds));

  // Use any non-null styleUrl from the backend; fall back to demo only when null.
  // (The provider check was removed — Mapbox styleUrls now correctly return null
  //  since mapbox:// sources are not resolvable by @maplibre/maplibre-react-native.)
  const styleUrl = mapConfig?.styleUrl ?? MAPLIBRE_DEMO_STYLE;

  // ── Loading ───────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor="#F2F5F8" />
        <View style={styles.center}>
          <ActivityIndicator color="#0D6053" size="large" />
        </View>
      </SafeAreaView>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────

  // Only when nothing was ever loaded: a failed poll keeps the last loaded map (plan §19).
  if (isError && !hasData) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor="#F2F5F8" />
        <ResponderHeader title="Map" />
        <View style={styles.center}>
          <StatePanel
            icon="cloud-offline-outline"
            title="Could not load assignments"
            body="Check your connection. The map shows your route once your missions load."
            actionLabel="Retry"
            actionIcon="refresh"
            onAction={() => refetch()}
          />
        </View>
      </SafeAreaView>
    );
  }

  // ── Unclassified — never report "no active mission" ───────────────────────

  if (unclassifiedAssignments.length > 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor="#F2F5F8" />
        <ResponderHeader title="Map" />
        <View style={styles.center}>
          <StatePanel
            icon="warning-outline"
            tone="amber"
            title="Assignment state unknown"
            body="An assignment could not be classified. Review your queue before navigating."
            actionLabel="View missions"
            actionIcon="clipboard-outline"
            onAction={() => router.push('/responder/assignments' as never)}
          />
        </View>
      </SafeAreaView>
    );
  }

  // ── No active mission ─────────────────────────────────────────────────────

  if (!primaryAssignment) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor="#F2F5F8" />
        <ResponderHeader title="Map" />
        <View style={styles.center}>
          <StatePanel
            icon="navigate-outline"
            tone="primary"
            title="No active mission"
            body="Your destination and route appear here when you have an active assignment."
          />
        </View>
      </SafeAreaView>
    );
  }

  // ── Mission present — render map or textual fallback ──────────────────────

  const incident = primaryAssignment.incidents;
  const address  =
    loc?.formatted_address ??
    ([loc?.barangay, loc?.municipality].filter(Boolean).join(', ') || 'Location pending');

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F2F5F8" />

      <SafeAreaView edges={['top']} style={styles.headerSafe}>
        <ResponderHeader title="Map" subtitle={incident?.public_reference ?? undefined} />
      </SafeAreaView>

      {/* Map area */}
      {mapAvailable ? (
        <MapErrorBoundary
          key={boundaryKey}
          onReset={() => setBoundaryKey((k) => k + 1)}
        >
          <React.Suspense
            fallback={
              <View style={[styles.mapArea, styles.mapFallback]}>
                <ActivityIndicator color="#0D6053" />
              </View>
            }
          >
            <View style={styles.mapArea}>
              <LiveTrackingMap
                styleUrl={styleUrl}
                incident={destination}
                responder={canShare ? responderPoint : null}
                routeGeometry={canShare ? (route.geometry ?? null) : null}
                routeDimmed={route.lastKnown}
                destination={transport.destinationMarker}
                incidentDimmed={incidentStatus === 'TRANSPORTING' && !!transport.destinationMarker}
                responderIcon="ambulance"
                citizenPhotoUri={reporterPhotoUri}
                priority={incident?.priority}
                pitch={canShare && responderPoint ? 50 : 0}
                navigationHeading={canShare && responderPoint?.heading != null ? responderPoint.heading : null}
                supports3dBuildings={mapConfig?.supports3dBuildings ?? false}
              />
            </View>
          </React.Suspense>
        </MapErrorBoundary>
      ) : (
        <View style={[styles.mapArea, styles.mapFallback]}>
          <Ionicons name="map-outline" size={36} color="#8795A3" />
          <Text style={styles.muted}>Live map requires the latest app build.</Text>
        </View>
      )}

      {/* Bottom sheet — the tab bar below it already clears the home indicator */}
      <View style={styles.sheet}>
        <ScrollView contentContainerStyle={styles.sheetScroll} showsVerticalScrollIndicator={false}>

          {/* Stale banner */}
          {(isStale || isError) && (
            <Notice
              icon={isError ? 'cloud-offline' : 'time-outline'}
              tone="amber"
              text={isError ? t.showingLastLoaded : 'Assignment data may be stale'}
              actionLabel="Refresh"
              onAction={() => refetch()}
            />
          )}

          {/* Destination card */}
          <View style={styles.destCard}>
            <View style={styles.destRow}>
              {transporting ? (
                <View style={[styles.destIcon, { backgroundColor: colors.infoSoft }]}>
                  <Ionicons name="medical" size={20} color={colors.info} />
                </View>
              ) : (
                <IncidentTypeIcon type={incident?.category ?? 'OTHER'} size={44} />
              )}
              <View style={{ flex: 1 }}>
                {transporting ? (
                  <>
                    <Text style={styles.destAddress} numberOfLines={2}>
                      {openTransport?.facilities?.name ?? t.destinationNotSet}
                    </Text>
                    <Text style={styles.destRef}>{t.cardTitle}</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.destAddress} numberOfLines={2}>{address}</Text>
                    <Text style={styles.destRef}>{incident?.public_reference ?? ''}</Text>
                  </>
                )}
              </View>
              <PressScale
                style={styles.openBtn}
                onPress={() => router.push(`/responder/assignment/${primaryAssignment.id}` as never)}
                accessibilityRole="button"
                accessibilityLabel="Open mission"
              >
                <Text style={styles.openBtnText}>Open</Text>
                <Ionicons name="arrow-forward" size={15} color={colors.white} />
              </PressScale>
            </View>

            {!isActive && (
              <View style={styles.waitingRow}>
                <Ionicons name="time-outline" size={14} color={colors.amberText} />
                <Text style={styles.waitingText}>Accepted. Awaiting dispatch progress: open the mission and tap Mark En Route when you leave.</Text>
              </View>
            )}
          </View>

          {/* Location sharing status (accepted missions) */}
          {canShare && (
            <View style={styles.shareStrip}>
              <View
                style={[
                  styles.shareDot,
                  { backgroundColor: share.sharing && share.push !== 'error' ? '#0D6053' : '#8795A3' },
                ]}
              />
              <Text style={styles.shareText}>
                {share.sharing
                  ? share.push === 'ok'
                    ? 'Live location sharing active — visible to the citizen'
                    : 'Live location sharing active'
                  : 'Starting location sharing…'}
              </Text>
            </View>
          )}

          {canShare && etaText != null && (
            <Text style={[styles.etaText, route.lastKnown && styles.etaStale]} numberOfLines={1}>{etaText}</Text>
          )}

          {/* Upload failing — the citizen is NOT seeing this unit */}
          {canShare && share.sharing && share.push === 'error' && (
            <View style={[styles.warnRow, styles.errorRow]}>
              <Ionicons name="cloud-offline" size={14} color="#D44858" />
              <Text style={[styles.warnText, { color: '#D44858' }]}>
                Your location is not reaching the citizen: {share.pushError ?? 'upload failed'}
              </Text>
            </View>
          )}

          {/* GPS permission denied */}
          {share.permissionDenied && (
            <View style={styles.warnRow}>
              <Ionicons name="warning" size={14} color="#D97706" />
              <Text style={styles.warnText}>
                Location permission denied — the citizen cannot see your position.
              </Text>
            </View>
          )}

          {canShare && (
            <TransportBanners transporting={transporting} target={target} routeLastKnown={route.lastKnown}
              destinationDeactivated={transport.destinationDeactivated} />
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F5F8' },

  headerSafe: { backgroundColor: '#F2F5F8' },

  center:         { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  iconWrap:       { width: 72, height: 72, borderRadius: 36, backgroundColor: '#EDF1F4', alignItems: 'center', justifyContent: 'center', marginBottom: 8, borderWidth: 1, borderColor: BEVEL },
  fallbackTitle:  { fontSize: 17, fontWeight: '700', color: '#1C2B3A', textAlign: 'center' },
  fallbackSub:    { fontSize: 13, color: '#8795A3', textAlign: 'center', lineHeight: 20 },
  muted:          { color: '#8795A3', textAlign: 'center', fontSize: 13, marginTop: 8 },
  retryBtn:           { marginTop: 12, backgroundColor: '#0D6053', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 11 },
  boundaryRetryBtn:   { marginTop: 16, backgroundColor: '#0D6053', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 11 },
  retryText:          { color: '#FFFFFF', fontWeight: '700' },
  missionBtn:     { marginTop: 16, backgroundColor: '#0D6053', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 11 },
  missionBtnText: { color: '#FFFFFF', fontWeight: '700' },

  mapArea:     { flex: 1 },
  mapFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#EDF1F4' },

  // Flat panel under the map: no overlap, so the map's attribution stays visible,
  // and no grab handle, because the panel does not drag.
  sheet: {
    maxHeight: 290, backgroundColor: colors.white,
    borderTopWidth: 1, borderTopColor: colors.border,
    shadowColor: '#18231F', shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 10,
  },
  sheetScroll: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },

  destCard:    { padding: 12, marginBottom: 10, borderRadius: radius.lg, backgroundColor: colors.bg },
  destRow:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  destIcon:    { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  destAddress: { fontSize: 14, color: colors.text, fontWeight: '800', lineHeight: 19 },
  destRef:     { fontSize: 12, color: colors.textMuted, fontWeight: '700', marginTop: 2, fontVariant: ['tabular-nums'] },
  openBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: colors.primary },
  openBtnText: { fontSize: 13, color: colors.white, fontWeight: '800' },
  waitingRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 10 },
  waitingText: { flex: 1, fontSize: 12, color: colors.amberText, lineHeight: 17 },

  shareStrip: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, paddingHorizontal: 2 },
  shareDot:   { width: 8, height: 8, borderRadius: 4 },
  shareText:  { flex: 1, fontSize: 13, color: colors.textMid },
  etaText:    { fontSize: 13, color: colors.primary, fontWeight: '800', marginBottom: 8, paddingHorizontal: 2 },
  etaStale:   { opacity: 0.6 },

  warnRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: colors.amberSoft, borderRadius: radius.md, padding: 10, marginBottom: 8 },
  errorRow: { backgroundColor: colors.dangerSoft },
  warnText: { flex: 1, fontSize: 12, color: colors.amberText, lineHeight: 17 },
});
