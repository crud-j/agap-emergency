import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, StatusBar, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useResponderSummary } from '@/src/hooks/useResponderSummary';
import { useResponderAssignments } from '@/src/hooks/useResponderAssignments';
import type { Assignment } from '@/src/services/api/responders.api';
import { useNetworkStatus } from '@/src/hooks/useNetworkStatus';
import { useAuthStore } from '@/src/stores/auth.store';
import { AvailabilityControl } from '@/src/components/responder/availability-control';
import { SurgeBroadcastCard } from '@/src/components/responder/SurgeBroadcastCard';
import { IncidentTypeIcon } from '@/src/components/incidents/incident-type-icon';
import { typeMeta, statusMeta, TONE_COLORS } from '@/src/components/incidents/incident-meta';
import {
  Notice, PressScale, ResponderTopBar, SectionLabel, Skeleton, StatePanel,
  responderCard, useScreenEntrance,
} from '@/src/components/responder/ui';
import { colors, radius } from '@/src/theme/tokens';

type GpsState = 'checking' | 'granted' | 'denied';
type IconName = React.ComponentProps<typeof Ionicons>['name'];

const AVAILABILITY: Record<string, { label: string; color: string; line: string }> = {
  AVAILABLE:   { label: 'Available',   color: '#5FD3B0', line: 'You are available for new assignments.' },
  OFF_DUTY:    { label: 'Off Duty',    color: '#B7CEC6', line: 'You are not currently available for new assignments.' },
  UNAVAILABLE: { label: 'Unavailable', color: '#FF8A95', line: 'You are marked unavailable.' },
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Responder Home (MOD-32 / MOD-28). Duty card first (who you are, your status,
 * what is waiting), then the one mission that matters right now, then duty
 * availability and shortcuts. Same queries and rules as before; layout follows
 * the citizen home (hero, cards, quick tiles).
 */
export default function HomeScreen() {
  const router = useRouter();
  const { isOnline } = useNetworkStatus();
  const authIsLoading = useAuthStore((s) => s.isLoading);
  const [gpsState, setGpsState] = useState<GpsState>('checking');
  const entrance = useScreenEntrance();

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
        <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <ResponderTopBar />
          <View style={[styles.hero, { gap: 10 }]}>
            <Skeleton height={12} width="35%" style={styles.skeletonOnDeep} />
            <Skeleton height={26} width="60%" style={styles.skeletonOnDeep} />
            <Skeleton height={56} style={[styles.skeletonOnDeep, { marginTop: 8 }]} />
          </View>
          <Skeleton height={12} width="30%" style={{ marginBottom: 10 }} />
          <View style={[responderCard, { height: 180, marginBottom: 20 }]} />
          <View style={[responderCard, { height: 120 }]} />
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
        <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
        <View style={styles.scroll}>
          <ResponderTopBar />
        </View>
        <View style={styles.center}>
          <StatePanel
            icon="cloud-offline-outline"
            title="Could not load your profile."
            body="Check your connection. Your assignments will appear once AGAP can reach the server."
            actionLabel="Retry"
            actionIcon="refresh"
            onAction={() => { refetchSummary(); refetchAssignments(); }}
          />
        </View>
      </SafeAreaView>
    );
  }

  const fullName = summary?.user.full_name ?? 'Responder';
  const status   = summary?.availability.status ?? 'OFF_DUTY';
  const avail    = AVAILABILITY[status] ?? { label: status, color: '#B7CEC6', line: '' };
  const orgName  = summary?.user.organizations?.[0]?.name ?? 'Bocaue MDRRMO';

  const isActive          = activeAssignments.length > 0;
  const primaryAssignment =
    activeAssignments[0] ?? acceptedAwaitingProgressAssignments[0] ?? null;
  const sharingActive = isActive && gpsState === 'granted';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      <Animated.ScrollView
        style={entrance}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <ResponderTopBar name={fullName} />

        {/* Stale / offline notice */}
        {!isOnline ? (
          <Notice icon="cloud-offline-outline" tone="danger" text="Offline. Showing the last loaded data." />
        ) : isStale ? (
          <Notice
            icon="time-outline"
            tone="amber"
            text="Assignments may be out of date."
            actionLabel="Refresh"
            onAction={() => refetchAssignments()}
          />
        ) : null}

        {/* ── Duty card ─────────────────────────────────────────────────── */}
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <Text style={styles.heroGreeting}>{greeting()},</Text>
            <View style={styles.heroStatus} accessibilityLabel={`Duty status: ${avail.label}`}>
              <View style={[styles.heroStatusDot, { backgroundColor: avail.color }]} />
              <Text style={styles.heroStatusText}>{avail.label}</Text>
            </View>
          </View>
          <Text style={styles.heroName} numberOfLines={1}>{fullName}</Text>
          <Text style={styles.heroOrg} numberOfLines={1}>{orgName}</Text>

          <View style={styles.heroStats}>
            <HeroStat value={String(activeAssignments.length)} label="Active" />
            <View style={styles.heroDivider} />
            <HeroStat
              value={String(pendingOffers.length)}
              label={pendingOffers.length === 1 ? 'Offer waiting' : 'Offers waiting'}
              highlight={pendingOffers.length > 0}
            />
            <View style={styles.heroDivider} />
            <HeroStat
              icon={sharingActive ? 'radio' : 'radio-outline'}
              value={sharingActive ? 'On' : 'Off'}
              label="Location"
              highlight={sharingActive}
            />
          </View>
        </View>

        {/* ── Surge broadcasts (MOD-52) ─────────────────────────────────── */}
        <SurgeBroadcastCard />

        {/* ── Current mission ──────────────────────────────────────────── */}
        <SectionLabel
          title="Current mission"
          actionLabel={assignments.length > 0 ? 'See all' : undefined}
          onAction={() => router.push('/responder/assignments' as never)}
        />

        {unclassifiedAssignments.length > 0 ? (
          // Unclassified assignment — warn but don't classify
          <PressScale
            style={[responderCard, styles.stateCard]}
            onPress={() => router.push('/responder/assignments' as never)}
            accessibilityRole="button"
            accessibilityLabel="An assignment has an unrecognized state. Open missions to review."
          >
            <View style={[styles.stateIcon, { backgroundColor: colors.amberSoft }]}>
              <Ionicons name="warning-outline" size={22} color={colors.amberText} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.stateTitle}>Check your missions</Text>
              <Text style={styles.stateSub}>An assignment has an unrecognized state. Tap to review.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#C4C9D1" />
          </PressScale>
        ) : primaryAssignment ? (
          <MissionCard
            assignment={primaryAssignment}
            isActive={isActive}
            isStale={isStale}
            onOpen={() => router.push(`/responder/assignment/${primaryAssignment.id}` as never)}
            onMap={() => router.push('/responder/map' as never)}
          />
        ) : pendingOffers.length > 0 ? (
          <PressScale
            style={[responderCard, styles.stateCard]}
            onPress={() => router.push('/responder/assignments' as never)}
            accessibilityRole="button"
            accessibilityLabel={`${pendingOffers.length} pending offers. Open missions to review.`}
          >
            <View style={[styles.stateIcon, { backgroundColor: colors.amberSoft }]}>
              <Ionicons name="notifications" size={22} color={colors.amberText} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.stateTitle}>
                {pendingOffers.length} pending offer{pendingOffers.length > 1 ? 's' : ''}
              </Text>
              <Text style={styles.stateSub}>Review and accept your assignment queue.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#C4C9D1" />
          </PressScale>
        ) : (
          <View style={[responderCard, styles.stateCard]}>
            <View style={[styles.stateIcon, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="shield-checkmark" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.stateTitle}>Standing by</Text>
              <Text style={styles.stateSub}>No active assignments. You will be notified when dispatched.</Text>
            </View>
          </View>
        )}

        {/* ── Duty availability ─────────────────────────────────────────── */}
        <SectionLabel title="Duty availability" />
        <View style={[responderCard, styles.availCard]}>
          <Text style={styles.availLine}>{avail.line}</Text>
          <AvailabilityControl currentStatus={status} />
          <View style={styles.availInfo}>
            <Ionicons name="information-circle-outline" size={15} color={colors.textMuted} />
            <Text style={styles.availInfoText}>
              This is your personal availability. It does not change any current assignment or incident status.
            </Text>
          </View>
        </View>

        {/* ── Quick access ──────────────────────────────────────────────── */}
        <SectionLabel title="Quick access" />
        <View style={styles.quickGrid}>
          <QuickTile
            icon="clipboard-outline"
            label="My missions"
            sub="Offers and assignments"
            badge={pendingOffers.length}
            onPress={() => router.push('/responder/assignments' as never)}
          />
          <QuickTile
            icon="navigate-outline"
            label="Live map"
            sub="Route and your position"
            onPress={() => router.push('/responder/map' as never)}
          />
          <QuickTile
            icon="map-outline"
            label="Coverage map"
            sub="Bocaue and 19 barangays"
            onPress={() => router.push('/coverage' as never)}
          />
          <QuickTile
            icon="person-outline"
            label="Profile"
            sub="Duty status and account"
            onPress={() => router.push('/responder/profile' as never)}
          />
        </View>
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

// ─── Pieces ─────────────────────────────────────────────────────────────────

function HeroStat({ value, label, icon, highlight }: {
  value: string;
  label: string;
  icon?: IconName;
  highlight?: boolean;
}) {
  return (
    <View style={styles.heroStat}>
      <View style={styles.heroStatValueRow}>
        {icon ? <Ionicons name={icon} size={15} color={highlight ? '#5FD3B0' : colors.onDeepMuted} /> : null}
        <Text style={[styles.heroStatValue, highlight && { color: '#5FD3B0' }]}>{value}</Text>
      </View>
      <Text style={styles.heroStatLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function MissionCard({
  assignment, isActive, isStale, onOpen, onMap,
}: {
  assignment: Assignment;
  isActive: boolean;
  isStale: boolean;
  onOpen: () => void;
  onMap: () => void;
}) {
  const incident = assignment.incidents;
  const category = incident?.category ?? 'OTHER';
  const meta = typeMeta(category);
  const loc = incident?.incident_locations;
  const area = [loc?.barangay, loc?.municipality].filter(Boolean).join(', ');
  const address = loc?.formatted_address ?? (area || null);
  const incidentStatus = String(incident?.status ?? '');
  const st = incidentStatus ? statusMeta(incidentStatus) : null;
  const tone = st ? TONE_COLORS[st.tone] : null;

  return (
    <View style={[responderCard, styles.missionCard]}>
      <View style={styles.missionHead}>
        <View style={[styles.missionFlag, isActive ? styles.flagActive : styles.flagAccepted]}>
          {isActive ? <View style={styles.liveDot} /> : <Ionicons name="time-outline" size={12} color={colors.info} />}
          <Text style={[styles.missionFlagText, { color: isActive ? colors.dangerStrong : colors.info }]}>
            {isActive ? 'ACTIVE ASSIGNMENT' : 'ACCEPTED'}
          </Text>
        </View>
        <Text style={styles.liveText}>{isStale ? 'May be stale' : 'Live'}</Text>
      </View>

      <View style={styles.missionMain}>
        <IncidentTypeIcon type={category} size={52} />
        <View style={styles.missionTitleWrap}>
          <Text style={styles.missionTitle} numberOfLines={1}>{meta.label}</Text>
          {incident?.public_reference ? (
            <Text style={styles.missionRef} selectable>{incident.public_reference}</Text>
          ) : null}
        </View>
      </View>

      {address ? (
        <View style={styles.missionRow}>
          <Ionicons name="location" size={15} color={colors.danger} />
          <View style={{ flex: 1 }}>
            {area ? <Text style={styles.missionArea}>{area}</Text> : null}
            <Text style={styles.missionAddress} numberOfLines={2}>{address}</Text>
          </View>
        </View>
      ) : null}

      {st && tone ? (
        <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
          <Ionicons name={st.icon} size={13} color={tone.fg} />
          <Text style={[styles.statusPillText, { color: tone.fg }]}>{st.label}</Text>
        </View>
      ) : null}

      <View style={styles.missionActions}>
        <PressScale
          wrapStyle={{ flex: 1 }}
          style={styles.btnPrimary}
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel="View mission"
        >
          <Text style={styles.btnPrimaryText}>View mission</Text>
          <Ionicons name="arrow-forward" size={17} color={colors.white} />
        </PressScale>
        <PressScale
          style={styles.btnSecondary}
          onPress={onMap}
          accessibilityRole="button"
          accessibilityLabel="Open map"
        >
          <Ionicons name="navigate" size={18} color={colors.primary} />
          <Text style={styles.btnSecondaryText}>Map</Text>
        </PressScale>
      </View>
    </View>
  );
}

function QuickTile({ icon, label, sub, badge, onPress }: {
  icon: IconName;
  label: string;
  sub: string;
  badge?: number;
  onPress: () => void;
}) {
  return (
    <PressScale
      wrapStyle={styles.quickWrap}
      style={[responderCard, styles.quickTile]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badge} waiting` : label}
    >
      <View style={styles.quickIcon}>
        <Ionicons name={icon} size={22} color={colors.primary} />
        {badge ? (
          <View style={styles.quickBadge}>
            <Text style={styles.quickBadgeText}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
      <Text style={styles.quickSub} numberOfLines={2}>{sub}</Text>
    </PressScale>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll:    { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Duty card — the citizen profile's deep-green identity surface.
  hero: {
    marginTop: 6, marginBottom: 20, padding: 20, borderRadius: radius.xl,
    backgroundColor: colors.primaryDeep, borderWidth: 1, borderColor: '#245248',
    shadowColor: colors.primaryDeep, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.22, shadowRadius: 18, elevation: 6,
  },
  skeletonOnDeep: { backgroundColor: 'rgba(255,255,255,0.12)' },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroGreeting: { fontSize: 14, fontWeight: '700', color: colors.onDeepMuted },
  heroStatus: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingHorizontal: 11, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)',
  },
  heroStatusDot: { width: 8, height: 8, borderRadius: 4 },
  heroStatusText: { fontSize: 12, fontWeight: '800', color: colors.white },
  heroName: { marginTop: 6, fontSize: 26, lineHeight: 32, fontWeight: '900', letterSpacing: -0.5, color: colors.white },
  heroOrg: { marginTop: 2, fontSize: 13, fontWeight: '600', color: colors.onDeepMuted },
  heroStats: {
    flexDirection: 'row', alignItems: 'stretch', marginTop: 18, paddingTop: 16,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)',
  },
  heroStat: { flex: 1, alignItems: 'flex-start' },
  heroStatValueRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  heroStatValue: { fontSize: 22, lineHeight: 26, fontWeight: '800', color: colors.white, fontVariant: ['tabular-nums'] },
  heroStatLabel: { marginTop: 2, fontSize: 11, fontWeight: '600', color: colors.onDeepMuted },
  heroDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.12)', marginHorizontal: 12 },

  // Simple state cards (standby / pending / unclassified)
  stateCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, marginBottom: 20 },
  stateIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  stateTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 3 },
  stateSub: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },

  // Mission card
  missionCard: { padding: 18, marginBottom: 20 },
  missionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  missionFlag: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 26, paddingHorizontal: 10, borderRadius: 13 },
  flagActive: { backgroundColor: colors.dangerSoft },
  flagAccepted: { backgroundColor: colors.infoSoft },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.danger },
  missionFlagText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  liveText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  missionMain: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  missionTitleWrap: { flex: 1, minWidth: 0 },
  missionTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  missionRef: { marginTop: 2, fontSize: 13, fontWeight: '700', color: colors.textMuted, fontVariant: ['tabular-nums'] },
  missionRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 16, padding: 12,
    borderRadius: radius.md, backgroundColor: colors.bg,
  },
  missionArea: { fontSize: 11, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 },
  missionAddress: { fontSize: 14, fontWeight: '600', color: colors.text, lineHeight: 19 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    height: 28, paddingHorizontal: 11, borderRadius: 14, marginTop: 12,
  },
  statusPillText: { fontSize: 12, fontWeight: '800' },
  missionActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btnPrimary: {
    height: 52, borderRadius: radius.lg, backgroundColor: colors.primary,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  btnPrimaryText: { color: colors.white, fontSize: 15, fontWeight: '800' },
  btnSecondary: {
    height: 52, paddingHorizontal: 18, borderRadius: radius.lg, backgroundColor: colors.primarySoft,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  btnSecondaryText: { color: colors.primary, fontSize: 15, fontWeight: '800' },

  // Availability
  availCard: { padding: 16, marginBottom: 20 },
  availLine: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 12 },
  availInfo: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginTop: 12 },
  availInfoText: { flex: 1, fontSize: 12, color: colors.textMuted, lineHeight: 17 },

  // Quick tiles (citizen home pattern)
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  quickWrap: { width: '48.5%' },
  quickTile: { padding: 16, minHeight: 132 },
  quickIcon: {
    width: 44, height: 44, borderRadius: 22, marginBottom: 12,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface,
  },
  quickBadge: {
    position: 'absolute', top: -3, right: -5, minWidth: 19, height: 19, paddingHorizontal: 5, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.danger, borderWidth: 1.5, borderColor: colors.white,
  },
  quickBadgeText: { fontSize: 10, fontWeight: '800', color: colors.white },
  quickLabel: { fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 3 },
  quickSub: { fontSize: 12, lineHeight: 16, color: colors.textMuted },
});
