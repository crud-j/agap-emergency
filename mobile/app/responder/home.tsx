import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useResponderSummary } from '@/src/hooks/useResponderSummary';
import { useResponderAssignments } from '@/src/hooks/useResponderAssignments';
import { useNetworkStatus } from '@/src/hooks/useNetworkStatus';
import { AvailabilityControl } from '@/src/components/responder/availability-control';

type GpsState = 'checking' | 'granted' | 'denied';

// Status colors on the dark gradient greeting card
const CARD_STATUS_COLOR: Record<string, string> = {
  AVAILABLE:   '#D1FAE5',
  OFF_DUTY:    'rgba(255,255,255,0.65)',
  UNAVAILABLE: '#FECACA',
};

const AVAILABILITY_LABEL: Record<string, string> = {
  AVAILABLE:   'Available',
  OFF_DUTY:    'Off Duty',
  UNAVAILABLE: 'Unavailable',
};

const CARD_SHADOW = {
  shadowColor: '#8795A3',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.09,
  shadowRadius: 12,
  elevation: 3,
};

const BEVEL = 'rgba(168,181,193,0.20)';

function SkeletonLine({ height = 14, width = '100%' as number | `${number}%` }: { height?: number; width?: number | `${number}%` }) {
  return <View style={{ height, width, backgroundColor: '#EDF1F4', borderRadius: 7, marginVertical: 3 }} />;
}

export default function HomeScreen() {
  const router = useRouter();
  const { isOnline } = useNetworkStatus();
  const [gpsState, setGpsState] = useState<GpsState>('checking');

  const {
    data: summary, isLoading: summaryLoading, isError: summaryError, refetch: refetchSummary,
  } = useResponderSummary();

  const {
    assignments,
    activeAssignments,
    acceptedAwaitingProgressAssignments,
    pendingOffers,
    unclassifiedAssignments,
    isStale,
    refetch: refetchAssignments,
  } = useResponderAssignments();

  // Non-requesting permission check — reads current status without prompting
  useEffect(() => {
    Location.getForegroundPermissionsAsync()
      .then(({ status }) => setGpsState(status === 'granted' ? 'granted' : 'denied'))
      .catch(() => setGpsState('denied'));
  }, []);

  // ── Skeleton loading ─────────────────────────────────────────────────────────
  if (summaryLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor="#F2F5F8" />
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.greetingCardSkeleton} />
          <View style={[styles.card, { marginBottom: 14 }]}>
            <SkeletonLine height={12} width="35%" />
            <SkeletonLine height={36} />
          </View>
          <View style={[styles.card, { marginBottom: 14 }]}>
            <SkeletonLine /><SkeletonLine height={12} width="70%" />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (summaryError) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor="#F2F5F8" />
        <View style={styles.center}>
          <View style={styles.iconWrap}>
            <Ionicons name="cloud-offline-outline" size={36} color="#8795A3" />
          </View>
          <Text style={styles.errorTitle}>Could not load your profile.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => { refetchSummary(); refetchAssignments(); }}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const firstName       = summary?.user.full_name?.split(' ')[0] ?? 'Responder';
  const fullName        = summary?.user.full_name ?? 'Responder';
  const status          = summary?.availability.status ?? 'OFF_DUTY';
  const statusLabel     = AVAILABILITY_LABEL[status] ?? status;
  const cardStatusColor = CARD_STATUS_COLOR[status] ?? 'rgba(255,255,255,0.65)';
  const orgName         = summary?.user.organizations[0]?.name ?? 'MDRRMO Bocaue';
  const initials        = fullName.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  // ── Mission state ────────────────────────────────────────────────────────────
  let missionTitle:  string;
  let missionDetail: string;
  let missionAction: (() => void) | null = null;
  let missionAccent: string = '#DCE3E9';

  if (unclassifiedAssignments.length > 0) {
    missionTitle  = 'Mission state unavailable';
    missionDetail = 'An assignment has an unrecognized state. Tap Missions to review.';
    missionAction = () => router.push('/responder/assignments' as never);
    missionAccent = '#D97706';
  } else if (activeAssignments.length > 0) {
    const first   = activeAssignments[0]!;
    const ref     = first.incidents?.public_reference ?? 'Active mission';
    missionTitle  = `Responding — ${ref}`;
    const loc     = first.incidents?.incident_locations;
    missionDetail = loc?.formatted_address
      ?? ([loc?.barangay, loc?.municipality].filter(Boolean).join(', ') || 'Location pending');
    missionAction = () => router.push(`/responder/assignment/${first.id}` as never);
    missionAccent = '#0D6053';
  } else if (acceptedAwaitingProgressAssignments.length > 0) {
    const first   = acceptedAwaitingProgressAssignments[0]!;
    missionTitle  = 'Accepted — awaiting dispatch progress';
    missionDetail = first.incidents?.public_reference ?? 'Assignment accepted';
    missionAction = () => router.push(`/responder/assignment/${first.id}` as never);
    missionAccent = '#3B82F6';
  } else if (pendingOffers.length > 0) {
    missionTitle  = `${pendingOffers.length} pending offer${pendingOffers.length > 1 ? 's' : ''}`;
    missionDetail = 'Review and accept your assignment queue.';
    missionAction = () => router.push('/responder/assignments' as never);
    missionAccent = '#D97706';
  } else {
    missionTitle  = 'Standing by';
    missionDetail = 'No active assignments. You will be notified when dispatched.';
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#0D6053" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Offline / stale banner */}
        {(!isOnline || isStale) && (
          <View style={[styles.banner, !isOnline ? styles.bannerOffline : styles.bannerStale]}>
            <Ionicons
              name={!isOnline ? 'cloud-offline-outline' : 'time-outline'}
              size={14}
              color={!isOnline ? '#D44858' : '#D97706'}
            />
            <Text style={[styles.bannerText, { color: !isOnline ? '#D44858' : '#D97706' }]}>
              {!isOnline ? 'Offline — showing cached data' : 'Assignments may be stale'}
            </Text>
          </View>
        )}

        {/* Greeting card — deep green gradient matching citizen home */}
        <LinearGradient
          colors={['#0D6053', '#094A3E']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.greetingCard}
        >
          {/* Top-left specular glint */}
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0)']}
            locations={[0, 0.38, 0.85]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.8, y: 0.72 }}
            style={[StyleSheet.absoluteFill, { borderRadius: 20 }]}
          />
          {/* Inner bevel */}
          <View pointerEvents="none" style={styles.greetingCardBevel} />

          <View style={styles.greetingAvatar}>
            <Text style={styles.greetingAvatarText}>{initials}</Text>
          </View>
          <View style={styles.greetingContent}>
            <Text style={styles.greetingName}>{firstName}</Text>
            <Text style={styles.greetingOrg}>{orgName}</Text>
          </View>
          <View style={styles.greetingStatusPill}>
            <View style={[styles.greetingStatusDot, { backgroundColor: cardStatusColor }]} />
            <Text style={[styles.greetingStatusText, { color: cardStatusColor }]}>{statusLabel}</Text>
          </View>
        </LinearGradient>

        {/* Availability control */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>DUTY STATUS</Text>
        </View>
        <View style={styles.card}>
          <AvailabilityControl currentStatus={status} />
        </View>

        {/* Mission card */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>CURRENT MISSION</Text>
          {(isStale && isOnline) && (
            <TouchableOpacity onPress={() => refetchAssignments()}>
              <Text style={styles.refreshLink}>Refresh</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[styles.card, { borderLeftWidth: 4, borderLeftColor: missionAccent }]}
          onPress={missionAction ?? undefined}
          activeOpacity={missionAction ? 0.8 : 1}
          disabled={!missionAction}
        >
          <View style={styles.missionRow}>
            <View style={styles.missionBody}>
              <Text style={styles.missionTitle}>{missionTitle}</Text>
              <Text style={styles.missionDetail} numberOfLines={2}>{missionDetail}</Text>
            </View>
            {missionAction && <Ionicons name="chevron-forward" size={18} color="#8795A3" />}
          </View>
        </TouchableOpacity>

        {/* Quick stats */}
        <View style={styles.statsRow}>
          <StatChip label="Active"  count={activeAssignments.length} color="#0D6053" />
          <StatChip label="Pending" count={pendingOffers.length}     color="#D97706" />
          <StatChip label="Total"   count={assignments.length}       color="#8795A3" />
        </View>

        {/* Readiness chips */}
        <View style={styles.readinessRow}>
          <ReadinessChip
            icon={isOnline ? 'wifi' : 'wifi-outline'}
            label={isOnline ? 'Online' : 'Offline'}
            color={isOnline ? '#0D6053' : '#D44858'}
          />
          <ReadinessChip
            icon={gpsState === 'denied' ? 'location-outline' : 'location'}
            label={gpsState === 'checking' ? 'GPS…' : gpsState === 'granted' ? 'GPS ready' : 'GPS denied'}
            color={gpsState === 'denied' ? '#D44858' : gpsState === 'checking' ? '#8795A3' : '#0D6053'}
          />
        </View>

        {/* Map shortcut */}
        <TouchableOpacity
          style={styles.mapShortcut}
          onPress={() => router.push('/responder/map' as never)}
          activeOpacity={0.85}
        >
          <View style={styles.mapShortcutIconWrap}>
            <Ionicons name="map-outline" size={20} color="#0D6053" />
          </View>
          <Text style={styles.mapShortcutText}>Mission Map</Text>
          <Ionicons name="chevron-forward" size={16} color="#8795A3" />
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

function StatChip({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statCount, { color }]}>{count}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ReadinessChip({ icon, label, color }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; color: string }) {
  return (
    <View style={[styles.readinessChip, { borderColor: `${color}40` }]}>
      <Ionicons name={icon} size={14} color={color} />
      <Text style={[styles.readinessLabel, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#F2F5F8' },
  scroll:     { padding: 16, paddingBottom: 24 },
  center:     { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  iconWrap:   { width: 72, height: 72, borderRadius: 36, backgroundColor: '#EDF1F4', alignItems: 'center', justifyContent: 'center', marginBottom: 8, borderWidth: 1, borderColor: BEVEL },
  errorTitle: { fontSize: 15, fontWeight: '700', color: '#1C2B3A' },
  retryBtn:   { marginTop: 12, backgroundColor: '#0D6053', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 11 },
  retryText:  { color: '#FFFFFF', fontWeight: '700' },

  // Skeleton placeholder for greeting card
  greetingCardSkeleton: { height: 104, borderRadius: 20, backgroundColor: '#DCE3E9', marginBottom: 20 },

  // Banners
  banner:        { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 12, padding: 10, marginBottom: 14, borderWidth: 1 },
  bannerOffline: { backgroundColor: '#FDF0F1', borderColor: 'rgba(212,72,88,0.20)' },
  bannerStale:   { backgroundColor: '#FFFBEB', borderColor: 'rgba(217,119,6,0.20)' },
  bannerText:    { fontSize: 12, fontWeight: '600', flex: 1 },

  // Greeting card
  greetingCard: {
    minHeight: 104, marginBottom: 20,
    paddingHorizontal: 18, paddingVertical: 18,
    borderRadius: 20,
    flexDirection: 'row', alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#094A3E', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.22, shadowRadius: 16, elevation: 6,
  },
  greetingCardBevel: {
    ...StyleSheet.absoluteFill,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  greetingAvatar:     { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.30)', marginRight: 12 },
  greetingAvatarText: { color: '#FFFFFF', fontSize: 19, fontWeight: '800' },
  greetingContent:    { flex: 1 },
  greetingName:       { fontSize: 20, fontWeight: '800', color: '#FFFFFF' },
  greetingOrg:        { fontSize: 12, color: 'rgba(255,255,255,0.72)', marginTop: 3 },
  greetingStatusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.18)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  greetingStatusDot:  { width: 7, height: 7, borderRadius: 4 },
  greetingStatusText: { fontSize: 11, fontWeight: '800' },

  // Section headers
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, marginTop: 4 },
  sectionTitle:  { fontSize: 11, color: '#8795A3', fontWeight: '700', letterSpacing: 0.9 },
  refreshLink:   { fontSize: 12, color: '#0D6053', fontWeight: '600' },

  // White cards
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: BEVEL, ...CARD_SHADOW },

  // Mission card
  missionRow:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  missionBody:   { flex: 1 },
  missionTitle:  { fontSize: 15, fontWeight: '700', color: '#1C2B3A', marginBottom: 3 },
  missionDetail: { fontSize: 12, color: '#8795A3', lineHeight: 17 },

  // Stats
  statsRow:  { flexDirection: 'row', gap: 10, marginBottom: 10 },
  stat:      { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: BEVEL, ...CARD_SHADOW },
  statCount: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 11, color: '#8795A3', fontWeight: '600', marginTop: 2 },

  // Readiness
  readinessRow:   { flexDirection: 'row', gap: 10, marginBottom: 14 },
  readinessChip:  { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 11, borderWidth: 1, ...CARD_SHADOW },
  readinessLabel: { fontSize: 12, fontWeight: '600' },

  // Map shortcut
  mapShortcut:         { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: BEVEL, ...CARD_SHADOW },
  mapShortcutIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EEF7F4', alignItems: 'center', justifyContent: 'center' },
  mapShortcutText:     { flex: 1, color: '#1C2B3A', fontWeight: '600', fontSize: 14 },
});
