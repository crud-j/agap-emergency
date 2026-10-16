import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, StatusBar, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useResponderSummary } from '@/src/hooks/useResponderSummary';
import { useResponderAssignments } from '@/src/hooks/useResponderAssignments';
import { useNetworkStatus } from '@/src/hooks/useNetworkStatus';
import { useAuthStore } from '@/src/stores/auth.store';
import { AvailabilityControl } from '@/src/components/responder/availability-control';

const AGAP_ICON = require('../../assets/icons/agap-solo-icon.png') as number;

type GpsState = 'checking' | 'granted' | 'denied';

const AVAILABILITY_LABEL: Record<string, string> = {
  AVAILABLE:   'Available',
  OFF_DUTY:    'Off Duty',
  UNAVAILABLE: 'Unavailable',
};

const AVAILABILITY_DOT: Record<string, string> = {
  AVAILABLE:   '#10B981',
  OFF_DUTY:    '#8795A3',
  UNAVAILABLE: '#EF4444',
};

const CATEGORY_LABEL: Record<string, string> = {
  MEDICAL:      'Medical emergency',
  ROAD_ACCIDENT:'Road accident',
  FLOOD:        'Flood rescue',
  RESCUE:       'Rescue operation',
  FIRE:         'Fire emergency',
  INDUSTRIAL:   'Industrial incident',
  DEBRIS:       'Debris clearance',
  OTHER:        'Emergency',
};

const INCIDENT_STATUS_BADGE: Record<string, { bg: string; text: string; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = {
  EN_ROUTE:    { bg: '#EFF6FF', text: '#3B82F6', label: 'En route',     icon: 'navigate' },
  ON_SCENE:    { bg: '#ECFDF5', text: '#059669', label: 'On scene',     icon: 'checkmark-circle-outline' },
  DISPATCHED:  { bg: '#FFF7ED', text: '#D97706', label: 'Dispatched',   icon: 'radio-outline' },
  TRANSPORTING:{ bg: '#F0FDF4', text: '#16A34A', label: 'Transporting', icon: 'car-outline' },
  ASSISTING:   { bg: '#ECFDF5', text: '#059669', label: 'Assisting',    icon: 'people-outline' },
};

function SkeletonLine({ height = 14, width = '100%' as number | `${number}%` }: {
  height?: number;
  width?: number | `${number}%`;
}) {
  return (
    <View style={{ height, width, backgroundColor: '#E4EAF0', borderRadius: 7, marginVertical: 3 }} />
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { isOnline } = useNetworkStatus();
  const authIsLoading = useAuthStore((s) => s.isLoading);
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

  // ── Skeleton loading ──────────────────────────────────────────────────────
  // Gate on authIsLoading too: SecureStore hydration is async, so the query
  // is disabled (token null) until loadFromStorage() completes. Without this
  // check the screen renders with undefined data before the token is ready.
  if (authIsLoading || summaryLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor="#F5F7FA" />
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={[styles.logoWrap, { backgroundColor: '#DCE3E9' }]} />
              <View style={{ gap: 4 }}>
                <SkeletonLine height={13} width={50} />
                <SkeletonLine height={10} width={88} />
              </View>
            </View>
            <View style={styles.headerRight}>
              <SkeletonLine height={28} width={90} />
              <View style={[styles.avatarCircle, { backgroundColor: '#DCE3E9' }]} />
            </View>
          </View>
          <SkeletonLine height={30} width="38%" />
          <SkeletonLine height={12} width="68%" />
          <View style={{ marginTop: 20, gap: 14 }}>
            <View style={[styles.card, { height: 170 }]} />
            <View style={[styles.card, { height: 270 }]} />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  // Only block the screen when there is truly no data — if the query fails
  // while stale data exists (background refetch, hot-reload, flaky network)
  // the main screen renders with stale data so the user isn't stranded.
  if (summaryError && !summary) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor="#F5F7FA" />
        <View style={styles.center}>
          <View style={styles.iconWrap}>
            <Ionicons name="cloud-offline-outline" size={36} color="#8795A3" />
          </View>
          <Text style={styles.errorTitle}>Could not load your profile.</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => { refetchSummary(); refetchAssignments(); }}
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const fullName    = summary?.user.full_name ?? 'Responder';
  const status      = summary?.availability.status ?? 'OFF_DUTY';
  const statusLabel = AVAILABILITY_LABEL[status] ?? status;
  const statusDot   = AVAILABILITY_DOT[status] ?? '#8795A3';
  const orgName     = summary?.user.organizations[0]?.name ?? 'MDRRMO Bocaue';
  const initials    = fullName.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  const isActive          = activeAssignments.length > 0;
  const primaryAssignment =
    activeAssignments[0] ?? acceptedAwaitingProgressAssignments[0] ?? null;

  const incidentRef    = primaryAssignment?.incidents?.public_reference;
  const category       = primaryAssignment?.incidents?.category ?? '';
  const incidentStatus = (primaryAssignment?.incidents?.status ?? '') as string;
  const loc            = primaryAssignment?.incidents?.incident_locations;
  const address        = loc?.formatted_address
    ?? ([loc?.barangay, loc?.municipality].filter(Boolean).join(', ') || null);
  const statusBadge    = INCIDENT_STATUS_BADGE[incidentStatus] ?? null;
  const sharingActive  = isActive && gpsState === 'granted';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F7FA" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Header bar ────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.logoWrap}>
              <Image source={AGAP_ICON} style={styles.logoIcon} resizeMode="contain" />
            </View>
            <View>
              <Text style={styles.logoName}>AGAP</Text>
              <Text style={styles.logoOrg}>{orgName}</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <View style={[
              styles.connPill,
              {
                backgroundColor: isOnline ? '#ECFDF5' : '#FEF2F2',
                borderColor: isOnline ? 'rgba(5,150,105,0.22)' : 'rgba(220,38,38,0.22)',
              },
            ]}>
              <View style={[styles.connDot, { backgroundColor: isOnline ? '#10B981' : '#EF4444' }]} />
              <Text style={[styles.connText, { color: isOnline ? '#059669' : '#DC2626' }]}>
                {isOnline ? 'Connected' : 'Offline'}
              </Text>
            </View>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          </View>
        </View>

        {/* Stale / offline banner */}
        {(!isOnline || (isStale && isOnline)) && (
          <View style={[
            styles.banner,
            !isOnline ? styles.bannerOffline : styles.bannerStale,
          ]}>
            <Ionicons
              name={!isOnline ? 'cloud-offline-outline' : 'time-outline'}
              size={13}
              color={!isOnline ? '#D44858' : '#D97706'}
            />
            <Text style={[styles.bannerText, { color: !isOnline ? '#D44858' : '#D97706' }]}>
              {!isOnline ? 'Offline — showing cached data' : 'Assignments may be stale'}
            </Text>
            {isOnline && isStale && (
              <TouchableOpacity onPress={() => refetchAssignments()}>
                <Text style={styles.refreshLink}>Refresh</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── Page title ────────────────────────────────────────────────── */}
        <View style={styles.pageTitle}>
          <Text style={styles.pageTitleText}>Home</Text>
          <Text style={styles.pageTitleSub}>Stay ready. Respond. Make a difference.</Text>
        </View>

        {/* ── Bocaue coverage map ───────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.coverageCard}
          activeOpacity={0.85}
          onPress={() => router.push('/coverage' as never)}
          accessibilityRole="button"
          accessibilityLabel="Open the Bocaue coverage map"
        >
          <View style={styles.coverageIconWrap}>
            <Ionicons name="map-outline" size={20} color="#0D6053" />
          </View>
          <View style={styles.coverageBody}>
            <Text style={styles.coverageTitle}>Bocaue coverage map</Text>
            <Text style={styles.coverageSub}>View the municipality and all 19 barangays</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#8795A3" />
        </TouchableOpacity>

        {/* ── Duty availability ─────────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Duty availability</Text>
            <Ionicons name="information-circle-outline" size={20} color="#C3CDD8" />
          </View>

          <View style={styles.availRow}>
            <View style={styles.availAvatar}>
              <Ionicons name="person-outline" size={22} color="#8795A3" />
            </View>
            <View style={styles.availBody}>
              <View style={styles.availStatusRow}>
                <View style={[styles.statusDot, { backgroundColor: statusDot }]} />
                <Text style={styles.availStatusText}>{statusLabel}</Text>
              </View>
              <Text style={styles.availSub}>
                {status === 'AVAILABLE'
                  ? 'You are available for new assignments.'
                  : status === 'UNAVAILABLE'
                  ? 'You are marked unavailable.'
                  : 'You are not currently available for new assignments.'}
              </Text>
            </View>
          </View>

          <AvailabilityControl currentStatus={status} />

          <View style={styles.availInfo}>
            <Ionicons name="information-circle-outline" size={13} color="#C3CDD8" />
            <Text style={styles.availInfoText}>
              This is your personal availability. It does not change any current assignment or incident status.
            </Text>
          </View>
        </View>

        {/* ── Your mission ──────────────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Your mission</Text>
            {assignments.length > 0 && (
              <TouchableOpacity
                style={styles.viewAllBtn}
                onPress={() => router.push('/responder/assignments' as never)}
              >
                <Text style={styles.viewAllText}>View all</Text>
                <Ionicons name="chevron-forward" size={13} color="#8795A3" />
              </TouchableOpacity>
            )}
          </View>

          {/* Unclassified assignment — warn but don't classify */}
          {unclassifiedAssignments.length > 0 ? (
            <TouchableOpacity
              style={styles.alertRow}
              onPress={() => router.push('/responder/assignments' as never)}
              activeOpacity={0.8}
            >
              <Ionicons name="warning-outline" size={16} color="#D97706" />
              <Text style={styles.alertRowText}>
                An assignment has an unrecognized state. Tap to review.
              </Text>
              <Ionicons name="chevron-forward" size={15} color="#D97706" />
            </TouchableOpacity>

          ) : primaryAssignment ? (
            <>
              {/* Priority badge + live/stale indicator */}
              <View style={styles.priorityRow}>
                <View style={[
                  styles.priorityBadge,
                  isActive
                    ? { backgroundColor: '#FFF7ED', borderColor: 'rgba(217,119,6,0.22)' }
                    : { backgroundColor: '#EFF6FF', borderColor: 'rgba(59,130,246,0.22)' },
                ]}>
                  <Ionicons
                    name={isActive ? 'warning' : 'time-outline'}
                    size={11}
                    color={isActive ? '#D97706' : '#3B82F6'}
                  />
                  <Text style={[styles.priorityText, { color: isActive ? '#D97706' : '#3B82F6' }]}>
                    {isActive ? 'HIGH PRIORITY' : 'ACCEPTED'}
                  </Text>
                </View>
                <Text style={styles.timestampText}>
                  {isStale ? 'May be stale' : 'Live'}
                </Text>
              </View>

              {/* Details (left) + map thumbnail (right) */}
              <View style={styles.missionContent}>
                <View style={styles.missionLeft}>
                  {incidentRef ? (
                    <Text style={styles.missionRef}>{incidentRef}</Text>
                  ) : null}

                  {category ? (
                    <View style={styles.missionCatRow}>
                      <Ionicons name="medkit-outline" size={14} color="#0D6053" />
                      <Text style={styles.missionCatText}>
                        {CATEGORY_LABEL[category] ?? category}
                      </Text>
                    </View>
                  ) : null}

                  {address ? (
                    <View style={styles.missionDetailRow}>
                      <Ionicons name="location-outline" size={13} color="#8795A3" style={{ marginTop: 1 }} />
                      <View style={{ flex: 1 }}>
                        {(loc?.barangay || loc?.municipality) ? (
                          <Text style={styles.detailLabel}>
                            {[loc.barangay, loc.municipality].filter(Boolean).join(', ')}
                          </Text>
                        ) : null}
                        <Text style={styles.detailValue} numberOfLines={2}>{address}</Text>
                      </View>
                    </View>
                  ) : null}

                  <View style={styles.missionDetailRow}>
                    <Ionicons name="people-outline" size={13} color="#8795A3" />
                    <View>
                      <Text style={styles.detailLabel}>Your role</Text>
                      <Text style={styles.detailValue}>Responder</Text>
                    </View>
                  </View>

                  {statusBadge ? (
                    <View style={[styles.statusBadge, { backgroundColor: statusBadge.bg }]}>
                      <Ionicons name={statusBadge.icon} size={11} color={statusBadge.text} />
                      <Text style={[styles.statusBadgeText, { color: statusBadge.text }]}>
                        {statusBadge.label}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* Tappable map thumbnail → opens map screen */}
                <TouchableOpacity
                  style={styles.mapThumb}
                  onPress={() => router.push('/responder/map' as never)}
                  activeOpacity={0.85}
                >
                  <View style={styles.mapThumbBody}>
                    <Ionicons name="map" size={28} color="#0D6053" />
                    <Text style={styles.mapThumbLabel}>Live{'\n'}map</Text>
                  </View>
                  <View style={styles.mapThumbNav}>
                    <Ionicons name="navigate" size={14} color="#FFFFFF" />
                  </View>
                </TouchableOpacity>
              </View>

              {/* Action buttons */}
              <View style={styles.missionActions}>
                <TouchableOpacity
                  style={styles.missionBtnPrimary}
                  onPress={() => router.push(`/responder/assignment/${primaryAssignment.id}` as never)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="document-text-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.missionBtnPrimaryText}>View mission</Text>
                  <Ionicons name="chevron-forward" size={15} color="#FFFFFF" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.missionBtnSecondary}
                  onPress={() => router.push('/responder/map' as never)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="map-outline" size={16} color="#1C2B3A" />
                  <Text style={styles.missionBtnSecondaryText}>Open map</Text>
                </TouchableOpacity>
              </View>
            </>

          ) : pendingOffers.length > 0 ? (
            <TouchableOpacity
              style={styles.stateRow}
              onPress={() => router.push('/responder/assignments' as never)}
              activeOpacity={0.85}
            >
              <View style={[styles.stateIcon, { backgroundColor: '#FFFBEB' }]}>
                <Ionicons name="notifications-outline" size={20} color="#D97706" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stateTitle}>
                  {pendingOffers.length} pending offer{pendingOffers.length > 1 ? 's' : ''}
                </Text>
                <Text style={styles.stateSub}>Review and accept your assignment queue.</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#C3CDD8" />
            </TouchableOpacity>

          ) : (
            <View style={styles.stateRow}>
              <View style={[styles.stateIcon, { backgroundColor: '#EEF7F4' }]}>
                <Ionicons name="shield-checkmark-outline" size={20} color="#0D6053" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stateTitle}>Standing by</Text>
                <Text style={styles.stateSub}>
                  No active assignments. You will be notified when dispatched.
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* ── Operational overview ──────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Operational overview</Text>
          <View style={styles.overviewRow}>
            <View style={styles.overviewItem}>
              <View style={[styles.overviewIconWrap, { backgroundColor: '#EEF7F4' }]}>
                <Ionicons name="document-text-outline" size={18} color="#0D6053" />
              </View>
              <Text style={styles.overviewCount}>{activeAssignments.length}</Text>
              <Text style={styles.overviewLabel}>Active{'\n'}mission</Text>
            </View>

            <View style={styles.overviewSep} />

            <View style={styles.overviewItem}>
              <View style={[styles.overviewIconWrap, { backgroundColor: '#FFFBEB' }]}>
                <Ionicons name="time-outline" size={18} color="#D97706" />
              </View>
              <Text style={styles.overviewCount}>{pendingOffers.length}</Text>
              <Text style={styles.overviewLabel}>Pending{'\n'}offers</Text>
            </View>

            <View style={styles.overviewSep} />

            <TouchableOpacity
              style={styles.overviewItem}
              onPress={() => isActive ? router.push('/responder/map' as never) : undefined}
              activeOpacity={isActive ? 0.7 : 1}
            >
              <View style={[styles.overviewIconWrap, {
                backgroundColor: sharingActive ? '#EEF7F4' : '#F0F3F6',
              }]}>
                <Ionicons
                  name="location-outline"
                  size={18}
                  color={sharingActive ? '#0D6053' : '#8795A3'}
                />
              </View>
              <Text style={styles.overviewLabel}>Sharing</Text>
              <View style={styles.sharingRow}>
                <View style={[styles.connDot, {
                  backgroundColor: sharingActive ? '#10B981' : '#8795A3',
                }]} />
                <Text style={[styles.sharingText, {
                  color: sharingActive ? '#10B981' : '#8795A3',
                }]}>
                  {sharingActive ? 'Active' : 'Inactive'}
                </Text>
                {isActive ? (
                  <Ionicons name="chevron-forward" size={11} color="#C3CDD8" />
                ) : null}
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Quick access ──────────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Quick access</Text>
          <View style={styles.quickList}>
            <TouchableOpacity
              style={styles.quickItem}
              onPress={() => router.push('/responder/assignments' as never)}
              activeOpacity={0.75}
            >
              <Ionicons name="list-outline" size={16} color="#40536D" />
              <Text style={styles.quickText}>My missions</Text>
              <Ionicons name="chevron-forward" size={13} color="#C3CDD8" />
            </TouchableOpacity>
            <View style={styles.quickSep} />
            <TouchableOpacity
              style={styles.quickItem}
              onPress={() => router.push('/responder/map' as never)}
              activeOpacity={0.75}
            >
              <Ionicons name="map-outline" size={16} color="#40536D" />
              <Text style={styles.quickText}>Open map</Text>
              <Ionicons name="chevron-forward" size={13} color="#C3CDD8" />
            </TouchableOpacity>
            <View style={styles.quickSep} />
            <TouchableOpacity
              style={styles.quickItem}
              onPress={() => router.push('/profile' as never)}
              activeOpacity={0.75}
            >
              <Ionicons name="person-outline" size={16} color="#40536D" />
              <Text style={styles.quickText}>Profile & availability</Text>
              <Ionicons name="chevron-forward" size={13} color="#C3CDD8" />
            </TouchableOpacity>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Shared tokens ────────────────────────────────────────────────────────────

const BEVEL = 'rgba(168,181,193,0.18)';
const SHADOW = {
  shadowColor: '#8795A3',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.08,
  shadowRadius: 8,
  elevation: 2,
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  scroll:    { padding: 16, paddingBottom: 32 },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  iconWrap:  { width: 72, height: 72, borderRadius: 36, backgroundColor: '#EDF1F4', alignItems: 'center', justifyContent: 'center', marginBottom: 8, borderWidth: 1, borderColor: BEVEL },
  errorTitle:{ fontSize: 15, fontWeight: '700', color: '#1C2B3A' },
  retryBtn:  { marginTop: 12, backgroundColor: '#0D6053', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 11 },
  retryText: { color: '#FFFFFF', fontWeight: '700' },

  // Header
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoWrap:    { width: 38, height: 38, borderRadius: 10, backgroundColor: '#0D6053', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logoIcon:    { width: 38, height: 38 },
  logoName:    { fontSize: 15, fontWeight: '800', color: '#1C2B3A', lineHeight: 18 },
  logoOrg:     { fontSize: 11, color: '#8795A3', lineHeight: 15 },
  connPill:    { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1 },
  connDot:     { width: 7, height: 7, borderRadius: 4 },
  connText:    { fontSize: 12, fontWeight: '600' },
  avatarCircle:{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#EEF7F4', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(13,96,83,0.18)' },
  avatarText:  { fontSize: 13, fontWeight: '800', color: '#0D6053' },

  // Banner
  banner:        { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 12, padding: 10, marginBottom: 14, borderWidth: 1 },
  bannerOffline: { backgroundColor: '#FDF0F1', borderColor: 'rgba(212,72,88,0.20)' },
  bannerStale:   { backgroundColor: '#FFFBEB', borderColor: 'rgba(217,119,6,0.20)' },
  bannerText:    { flex: 1, fontSize: 12, fontWeight: '500' },
  refreshLink:   { fontSize: 12, color: '#0D6053', fontWeight: '700' },

  // Page title
  pageTitle:    { marginBottom: 18 },
  pageTitleText:{ fontSize: 28, fontWeight: '800', color: '#1C2B3A', lineHeight: 33 },
  pageTitleSub: { fontSize: 13, color: '#8795A3', marginTop: 3 },

  // Cards
  card:         { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: BEVEL, ...SHADOW },
  cardTitle:    { fontSize: 16, fontWeight: '700', color: '#1C2B3A' },

  // Coverage-map shortcut
  coverageCard:    { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderRadius: 18, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: BEVEL, ...SHADOW },
  coverageIconWrap:{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#EEF7F4', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(13,96,83,0.14)' },
  coverageBody:    { flex: 1 },
  coverageTitle:   { fontSize: 14, fontWeight: '800', color: '#1C2B3A' },
  coverageSub:     { fontSize: 12, color: '#8795A3', marginTop: 2 },
  cardHeaderRow:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },

  // Availability
  availRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  availAvatar:    { width: 46, height: 46, borderRadius: 23, backgroundColor: '#F0F3F6', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: BEVEL },
  availBody:      { flex: 1 },
  availStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  statusDot:      { width: 8, height: 8, borderRadius: 4 },
  availStatusText:{ fontSize: 15, fontWeight: '700', color: '#1C2B3A' },
  availSub:       { fontSize: 12, color: '#8795A3', lineHeight: 17 },
  availInfo:      { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 12, backgroundColor: '#F5F7FA', borderRadius: 10, padding: 10 },
  availInfoText:  { flex: 1, fontSize: 11, color: '#8795A3', lineHeight: 16 },

  // Mission header
  viewAllBtn:  { flexDirection: 'row', alignItems: 'center', gap: 2 },
  viewAllText: { fontSize: 13, color: '#8795A3', fontWeight: '600' },

  // Alert row
  alertRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFBEB', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(217,119,6,0.18)' },
  alertRowText:{ flex: 1, fontSize: 13, color: '#D97706', fontWeight: '500' },

  // Priority badge
  priorityRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  priorityBadge:{ flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1 },
  priorityText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  timestampText:{ fontSize: 11, color: '#8795A3' },

  // Mission content
  missionContent:  { flexDirection: 'row', gap: 12, marginBottom: 14 },
  missionLeft:     { flex: 1 },
  missionRef:      { fontSize: 18, fontWeight: '800', color: '#1C2B3A', marginBottom: 6, fontVariant: ['tabular-nums'] },
  missionCatRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  missionCatText:  { fontSize: 13, color: '#0D6053', fontWeight: '600' },
  missionDetailRow:{ flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginBottom: 8 },
  detailLabel:     { fontSize: 11, color: '#8795A3', marginBottom: 1 },
  detailValue:     { fontSize: 12, color: '#1C2B3A', fontWeight: '600', lineHeight: 17 },
  statusBadge:     { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5, marginTop: 2 },
  statusBadgeText: { fontSize: 12, fontWeight: '700' },

  // Map thumbnail
  mapThumb:     { width: 108, borderRadius: 14, backgroundColor: '#EEF7F4', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(13,96,83,0.15)' },
  mapThumbBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 10 },
  mapThumbLabel:{ fontSize: 11, color: '#0D6053', fontWeight: '600', textAlign: 'center', lineHeight: 15 },
  mapThumbNav:  { backgroundColor: '#0D6053', alignItems: 'center', justifyContent: 'center', padding: 10 },

  // Mission action buttons
  missionActions:       { flexDirection: 'row', gap: 10 },
  missionBtnPrimary:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: '#0D6053', borderRadius: 13, paddingVertical: 13 },
  missionBtnPrimaryText:{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  missionBtnSecondary:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: '#F0F3F6', borderRadius: 13, paddingVertical: 13, paddingHorizontal: 16, borderWidth: 1, borderColor: BEVEL },
  missionBtnSecondaryText:{ color: '#1C2B3A', fontWeight: '600', fontSize: 14 },

  // State rows (standby, pending, unclassified)
  stateRow:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stateIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  stateTitle:{ fontSize: 14, fontWeight: '700', color: '#1C2B3A', marginBottom: 3 },
  stateSub:  { fontSize: 12, color: '#8795A3', lineHeight: 17 },

  // Operational overview
  overviewRow:    { flexDirection: 'row', alignItems: 'flex-start', marginTop: 14 },
  overviewItem:   { flex: 1, alignItems: 'center', gap: 4 },
  overviewSep:    { width: 1, backgroundColor: BEVEL, alignSelf: 'stretch', marginHorizontal: 4 },
  overviewIconWrap:{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  overviewCount:  { fontSize: 22, fontWeight: '800', color: '#1C2B3A' },
  overviewLabel:  { fontSize: 11, color: '#8795A3', textAlign: 'center', lineHeight: 15 },
  sharingRow:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sharingText:    { fontSize: 11, fontWeight: '600' },

  // Quick access
  quickList: { marginTop: 12 },
  quickItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13 },
  quickText: { flex: 1, fontSize: 13, color: '#40536D', fontWeight: '600' },
  quickSep:  { height: StyleSheet.hairlineWidth, backgroundColor: BEVEL },
});
