import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { MapProvider } from '@agap/shared';
import { useAuthStore } from '@/src/stores/auth.store';
import {
  getAssignment,
  acceptAssignment,
  updateAssignmentStatus,
} from '@/src/services/api/responders.api';
import { getMapConfig } from '@/src/services/api/locations.api';
import { useResponderLocationShare } from '@/src/hooks/useResponderLocationShare';
import { useRouteLine } from '@/src/hooks/useRouteLine';
import { NavigateButton } from '@/src/components/responder/navigate-button';
import type { LatLngLite } from '@/src/components/tracking/live-tracking-map';
import { isNativeMapAvailable } from '@/src/components/tracking/native-map-available';
import { categoryIcon, categoryColor, priorityColor, titleCase } from '@/src/lib/incident-visuals';

const LiveTrackingMap = React.lazy(() => import('@/src/components/tracking/live-tracking-map'));
const MAP_AVAILABLE = isNativeMapAvailable();
const MAPLIBRE_DEMO_STYLE = 'https://demotiles.maplibre.org/style.json';

const ACTIVE_STATUSES = new Set(['ACCEPTED', 'EN_ROUTE', 'ON_SCENE', 'TRANSPORTING']);

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];
type NextAction =
  | { kind: 'accept'; label: string; icon: IoniconName }
  | { kind: 'status'; label: string; status: string; icon: IoniconName }
  | null;

function nextAction(status: string): NextAction {
  switch (status) {
    case 'PENDING':
    case 'SENT':
      return { kind: 'accept', label: 'Accept Assignment', icon: 'checkmark-circle' };
    case 'ACCEPTED':
      return { kind: 'status', label: 'Mark En Route', status: 'EN_ROUTE', icon: 'navigate' };
    case 'EN_ROUTE':
      return { kind: 'status', label: 'Mark On Scene', status: 'ON_SCENE', icon: 'location' };
    case 'ON_SCENE':
      return { kind: 'status', label: 'Mark Transporting', status: 'TRANSPORTING', icon: 'car' };
    default:
      return null;
  }
}

/**
 * Responder assignment detail (MOD-32 / MOD-43). Shows the incident + citizen
 * location on a live map with an in-app route, lets the crew advance the status,
 * and — once engaged — shares the unit's live location back to the citizen.
 */
export default function AssignmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const token = useAuthStore((s) => s.accessToken);
  const [busy, setBusy] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['responder-assignment', id],
    queryFn: () => getAssignment(id as string, token as string),
    enabled: !!id && !!token,
    refetchInterval: 10000,
  });

  const { data: mapConfig } = useQuery({
    queryKey: ['map-config'],
    queryFn: () => getMapConfig(token ?? undefined),
    staleTime: 5 * 60 * 1000,
  });

  const incident = data?.incidents ?? null;
  const unit = data?.resources ?? null;
  const loc = incident?.incident_locations ?? null;
  const accent = categoryColor(incident?.category);

  const citizenPoint: LatLngLite | null =
    loc?.latitude != null && loc?.longitude != null
      ? { lat: Number(loc.latitude), lng: Number(loc.longitude) }
      : null;
  const address =
    loc?.formatted_address ??
    ([loc?.barangay, loc?.municipality, loc?.province].filter(Boolean).join(', ') || null);

  const status = data?.status ?? '';
  const shareEnabled = ACTIVE_STATUSES.has(status);
  const share = useResponderLocationShare(data?.incident_id, shareEnabled);
  const myPoint: (LatLngLite & { heading?: number }) | null = share.myPosition
    ? {
        lat: share.myPosition.lat,
        lng: share.myPosition.lng,
        ...(share.myPosition.heading != null ? { heading: share.myPosition.heading } : {}),
      }
    : null;

  const route = useRouteLine(MAP_AVAILABLE ? myPoint : null, MAP_AVAILABLE ? citizenPoint : null);

  const styleUrl =
    mapConfig?.provider === MapProvider.MAPLIBRE && mapConfig.styleUrl
      ? mapConfig.styleUrl
      : MAPLIBRE_DEMO_STYLE;

  const action = nextAction(status);

  async function runAction() {
    if (!action || !id || !token) return;
    setBusy(true);
    try {
      if (action.kind === 'accept') {
        await acceptAssignment(id, token);
      } else {
        await updateAssignmentStatus(id, action.status, token);
      }
      await refetch();
    } catch {
      Alert.alert('Action failed', 'Could not update the assignment. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color="#F8FAFC" />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.headerTitle}>{unit?.call_sign ?? 'Assignment'}</Text>
          <Text style={styles.headerSub}>{unit?.name ?? 'Responding unit'}</Text>
        </View>
        <View style={styles.iconBtn} />
      </SafeAreaView>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#34D399" />
        </View>
      ) : isError || !data ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={40} color="#64748B" />
          <Text style={styles.muted}>Could not load this assignment.</Text>
        </View>
      ) : (
        <>
          <View style={styles.mapWrap}>
            {!MAP_AVAILABLE ? (
              <View style={styles.mapFallback}>
                <Ionicons name="map-outline" size={40} color="#64748B" />
                <Text style={styles.muted}>Live map requires the latest app build.</Text>
              </View>
            ) : (
              <MapErrorBoundary>
                <React.Suspense fallback={<View style={styles.mapFallback}><ActivityIndicator color="#34D399" /></View>}>
                  <LiveTrackingMap
                    styleUrl={styleUrl}
                    incident={citizenPoint}
                    responder={myPoint}
                    routeGeometry={route.geometry}
                  />
                </React.Suspense>
              </MapErrorBoundary>
            )}

            {/* Route ETA chip floating over the map */}
            {route.durationSeconds != null && (
              <View style={styles.etaChip}>
                <Ionicons name="time" size={14} color="#0B1220" style={{ marginRight: 6 }} />
                <Text style={styles.etaChipText}>
                  {formatKm(route.distanceMeters)} • ~{formatMin(route.durationSeconds)}
                </Text>
              </View>
            )}
          </View>

          <ScrollView style={styles.sheet} contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
            {/* Command card */}
            <View style={styles.commandCard}>
              <View style={[styles.catIcon, { backgroundColor: `${accent}22` }]}>
                <Ionicons name={categoryIcon(incident?.category)} size={24} color={accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{titleCase(incident?.category ?? 'Incident')}</Text>
                <Text style={styles.ref}>{incident?.public_reference ?? ''}</Text>
              </View>
              <View style={[styles.prioPill, { backgroundColor: priorityColor(incident?.priority) }]}>
                <Text style={styles.prioText}>{titleCase(incident?.priority)}</Text>
              </View>
            </View>

            {/* Sharing status strip */}
            <View style={styles.shareStrip}>
              <View style={[styles.dot, { backgroundColor: share.sharing ? '#34D399' : '#64748B' }]} />
              <Text style={styles.shareText}>
                {share.sharing
                  ? 'Live location sharing active'
                  : shareEnabled
                    ? 'Starting location sharing…'
                    : 'Accept to start sharing your location'}
              </Text>
              <View style={[styles.statusChip, { backgroundColor: '#0D605322' }]}>
                <Text style={styles.statusChipText}>{titleCase(status)}</Text>
              </View>
            </View>
            {share.permissionDenied && (
              <View style={styles.warnRow}>
                <Ionicons name="warning" size={14} color="#FBBF24" style={{ marginRight: 6 }} />
                <Text style={styles.warnText}>Location permission denied — the citizen can't see your position.</Text>
              </View>
            )}

            {/* Info rows */}
            <InfoRow icon="navigate-circle" label="Scene location" value={address ?? 'Address not available'}
              sub={citizenPoint ? `${citizenPoint.lat.toFixed(5)}, ${citizenPoint.lng.toFixed(5)}` : undefined} />
            {incident?.description ? (
              <InfoRow icon="document-text" label="Details" value={incident.description} />
            ) : null}
            {incident?.number_of_patients != null && (
              <InfoRow icon="people" label="Patients" value={String(incident.number_of_patients)} />
            )}

            <NavigateButton
              lat={citizenPoint?.lat}
              lng={citizenPoint?.lng}
              label={address ?? incident?.public_reference}
              caption="Voice navigation (Waze / Maps)"
              variant="secondary"
              style={{ marginTop: 14 }}
            />

            {/* On-scene patient assessment (MOD-37) — available once engaged. */}
            {data.incident_id && ACTIVE_STATUSES.has(status) && (
              <TouchableOpacity
                style={styles.assessBtn}
                onPress={() => router.push(`/responder/assessment/${data.incident_id}`)}
                activeOpacity={0.85}
              >
                <Ionicons name="clipboard" size={18} color="#34D399" style={{ marginRight: 8 }} />
                <Text style={styles.assessText}>On-Scene Assessment</Text>
                <Ionicons name="chevron-forward" size={18} color="#64748B" style={{ marginLeft: 'auto' }} />
              </TouchableOpacity>
            )}

            {/* Incident chat (MOD-33) — message the reporter + dispatch. */}
            {data.incident_id && (
              <TouchableOpacity
                style={styles.assessBtn}
                onPress={() => router.push(`/incident/chat/${data.incident_id}`)}
                activeOpacity={0.85}
              >
                <Ionicons name="chatbubbles" size={18} color="#34D399" style={{ marginRight: 8 }} />
                <Text style={styles.assessText}>Incident Chat</Text>
                <Ionicons name="chevron-forward" size={18} color="#64748B" style={{ marginLeft: 'auto' }} />
              </TouchableOpacity>
            )}
          </ScrollView>

          {action && (
            <SafeAreaView edges={['bottom']} style={styles.footer}>
              <TouchableOpacity
                style={[styles.actionBtn, busy && styles.actionBtnDisabled]}
                onPress={runAction}
                disabled={busy}
                activeOpacity={0.85}
              >
                {busy ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name={action.icon} size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                    <Text style={styles.actionText}>{action.label}</Text>
                  </>
                )}
              </TouchableOpacity>
            </SafeAreaView>
          )}
        </>
      )}
    </View>
  );
}

function InfoRow({
  icon,
  label,
  value,
  sub,
}: {
  icon: IoniconName;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={18} color="#34D399" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
        {sub ? <Text style={styles.infoSub}>{sub}</Text> : null}
      </View>
    </View>
  );
}

function formatKm(meters: number | null): string {
  if (meters == null) return '—';
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

function formatMin(seconds: number | null): string {
  if (seconds == null) return '—';
  const mins = Math.max(1, Math.round(seconds / 60));
  return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} hr ${mins % 60} min`;
}

class MapErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return (
        <View style={styles.mapFallback}>
          <Ionicons name="map-outline" size={40} color="#64748B" />
          <Text style={styles.muted}>Live map requires the latest app build.</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B1220' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingBottom: 10, backgroundColor: '#0B1220',
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#F8FAFC', letterSpacing: 0.3 },
  headerSub: { fontSize: 11, color: '#64748B' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  muted: { color: '#94A3B8', marginTop: 10, textAlign: 'center' },

  mapWrap: { height: 280, backgroundColor: '#111C2E' },
  mapFallback: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  etaChip: {
    position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#34D399', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  etaChipText: { color: '#0B1220', fontSize: 13, fontWeight: '800' },

  sheet: { flex: 1, backgroundColor: '#0B1220' },

  commandCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#111C2E', borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: '#1E293B',
  },
  catIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 19, fontWeight: '800', color: '#F8FAFC' },
  ref: { fontSize: 12, fontFamily: 'monospace', color: '#64748B', marginTop: 2 },
  prioPill: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  prioText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },

  shareStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 12, paddingHorizontal: 4,
  },
  dot: { width: 9, height: 9, borderRadius: 5 },
  shareText: { color: '#CBD5E1', fontSize: 13, flex: 1 },
  statusChip: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  statusChipText: { color: '#34D399', fontSize: 11, fontWeight: '800' },
  warnRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingHorizontal: 4 },
  warnText: { color: '#FBBF24', fontSize: 12, flex: 1 },

  infoRow: {
    flexDirection: 'row', gap: 12, backgroundColor: '#111C2E', borderRadius: 14,
    padding: 14, marginTop: 12, borderWidth: 1, borderColor: '#1E293B',
  },
  infoIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#0D605322', alignItems: 'center', justifyContent: 'center' },
  infoLabel: { color: '#64748B', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 },
  infoValue: { color: '#F8FAFC', fontSize: 15, lineHeight: 21 },
  infoSub: { color: '#64748B', fontSize: 12, fontFamily: 'monospace', marginTop: 4 },

  assessBtn: {
    flexDirection: 'row', alignItems: 'center', marginTop: 14, padding: 16,
    backgroundColor: '#111C2E', borderRadius: 14, borderWidth: 1, borderColor: '#1E293B',
  },
  assessText: { color: '#F8FAFC', fontSize: 15, fontWeight: '700' },

  footer: { paddingHorizontal: 16, paddingTop: 10, backgroundColor: '#0B1220', borderTopWidth: 1, borderTopColor: '#1E293B' },
  actionBtn: { flexDirection: 'row', height: 54, borderRadius: 14, backgroundColor: '#0D6053', alignItems: 'center', justifyContent: 'center' },
  actionBtnDisabled: { backgroundColor: '#334155' },
  actionText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});
