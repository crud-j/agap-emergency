import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/src/stores/auth.store';
import type { Assignment } from '@/src/services/api/responders.api';
import { useResponderAssignments } from '@/src/hooks/useResponderAssignments';
import { categoryIcon, categoryColor, priorityColor, titleCase } from '@/src/lib/incident-visuals';

const AGAP_ICON = require('../../assets/icons/agap-solo-icon.png') as number;

const COLORS = {
  pearl: '#F5F7FA',
  white: '#FFFFFF',
  green: '#0D6053',
  greenSoft: '#EEF7F4',
  text: '#1C2B3A',
  secondary: '#40536D',
  muted: '#8795A3',
  surface: '#EDF1F4',
  border: 'rgba(168,181,193,0.28)',
  amber: '#D97706',
  amberSoft: '#FFFBEB',
  blue: '#3B82F6',
  blueSoft: '#EFF6FF',
  red: '#D44858',
  redSoft: '#FDF0F1',
};

const CARD_SHADOW = {
  shadowColor: '#8795A3',
  shadowOffset: { width: 0, height: 3 },
  shadowOpacity: 0.07,
  shadowRadius: 10,
  elevation: 2,
};

const STATUS_STYLES: Record<string, { label: string; color: string; background: string; icon: keyof typeof Ionicons.glyphMap }> = {
  PENDING: { label: 'Pending offer', color: COLORS.amber, background: COLORS.amberSoft, icon: 'time-outline' },
  SENT: { label: 'Pending offer', color: COLORS.amber, background: COLORS.amberSoft, icon: 'time-outline' },
  ACCEPTED: { label: 'Accepted', color: COLORS.blue, background: COLORS.blueSoft, icon: 'checkmark-circle-outline' },
  EN_ROUTE: { label: 'En route', color: COLORS.blue, background: COLORS.blueSoft, icon: 'navigate-outline' },
  ON_SCENE: { label: 'On scene', color: COLORS.green, background: COLORS.greenSoft, icon: 'location-outline' },
  TRANSPORTING: { label: 'Transporting', color: '#7C3AED', background: '#F5F3FF', icon: 'car-outline' },
  ASSISTING: { label: 'Assisting', color: COLORS.green, background: COLORS.greenSoft, icon: 'people-outline' },
  COMPLETED: { label: 'Completed', color: COLORS.muted, background: COLORS.surface, icon: 'checkmark-done-outline' },
  CANCELLED: { label: 'Cancelled', color: COLORS.muted, background: COLORS.surface, icon: 'close-circle-outline' },
  REJECTED: { label: 'Declined', color: COLORS.muted, background: COLORS.surface, icon: 'close-circle-outline' },
};

function getStatus(item: Assignment) {
  const dispatchStatus = String(item.status ?? '').toUpperCase();
  const incidentStatus = String(item.incidents?.status ?? '').toUpperCase();

  // Dispatches often remain ACCEPTED while the incident moves through operational states.
  const effectiveStatus =
    dispatchStatus === 'ACCEPTED' && STATUS_STYLES[incidentStatus]
      ? incidentStatus
      : dispatchStatus;

  return STATUS_STYLES[effectiveStatus] ?? {
    label: 'Assignment status unavailable',
    color: COLORS.secondary,
    background: COLORS.surface,
    icon: 'alert-circle-outline' as const,
  };
}

/**
 * Responder assignment queue (MOD-32).
 * Keeps the existing API/query hook and assignment-detail route unchanged.
 */
export default function AssignmentsScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { assignments, isLoading, isError, isRefreshing, refetch } = useResponderAssignments();

  const firstName = user?.full_name?.split(' ')[0] ?? 'Responder';
  const initials = (user?.full_name?.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('') ?? 'R').toUpperCase();
  const pendingCount = assignments.filter((item) => ['PENDING', 'SENT'].includes(String(item.status ?? '').toUpperCase())).length;
  const unknownCount = assignments.filter((item) => getStatus(item).label === 'Assignment status unavailable').length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.pearl} />

      <View style={styles.header}>
        {/* ── Header bar ───────────────────────────────────────────────── */}
        <View style={styles.headerTopRow}>
          <View style={styles.headerLeft}>
            <View style={styles.logoWrap}>
              <Image source={AGAP_ICON} style={styles.logoIcon} resizeMode="contain" />
            </View>
            <View>
              <Text style={styles.logoName}>AGAP</Text>
              <Text style={styles.logoOrg}>MDRRMO Bocaue</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <View style={[
              styles.connPill,
              {
                backgroundColor: isError ? '#FEF2F2' : COLORS.white,
                borderColor: isError ? 'rgba(220,38,38,0.22)' : COLORS.border,
              },
            ]}>
              <View style={[styles.connDot, { backgroundColor: isError ? '#EF4444' : COLORS.muted }]} />
              <Text style={[styles.connText, { color: isError ? '#DC2626' : COLORS.secondary }]}>
                {isError ? 'Sync issue' : 'Mission queue'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={() => refetch()}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Refresh missions"
              hitSlop={4}
            >
              {isRefreshing ? (
                <ActivityIndicator color={COLORS.green} size="small" />
              ) : (
                <Ionicons name="refresh-outline" size={20} color={COLORS.secondary} />
              )}
            </TouchableOpacity>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          </View>
        </View>

        {/* ── Page title ───────────────────────────────────────────────── */}
        <View style={styles.pageTitle}>
          <Text style={styles.pageTitleText}>Missions</Text>
          <Text style={styles.pageTitleSub}>Assignments and incident activity</Text>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>{assignments.length}</Text>
            <Text style={styles.summaryLabel}>Assignments</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryNumber, pendingCount > 0 && { color: COLORS.amber }]}>{pendingCount}</Text>
            <Text style={styles.summaryLabel}>Pending offers</Text>
          </View>
          {unknownCount > 0 && (
            <>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryNumber, { color: COLORS.secondary }]}>{unknownCount}</Text>
                <Text style={styles.summaryLabel}>Need review</Text>
              </View>
            </>
          )}
        </View>
      </View>

      {isLoading && assignments.length === 0 ? (
        <LoadingState />
      ) : isError && assignments.length === 0 ? (
        <View style={styles.centerState}>
          <View style={styles.stateIcon}>
            <Ionicons name="cloud-offline-outline" size={30} color={COLORS.secondary} />
          </View>
          <Text style={styles.stateTitle}>Unable to refresh missions</Text>
          <Text style={styles.stateDescription}>Check your connection and try loading your assignments again.</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => refetch()} activeOpacity={0.85}>
            <Ionicons name="refresh-outline" size={18} color={COLORS.white} />
            <Text style={styles.primaryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={assignments}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            assignments.length === 0 && styles.emptyListContent,
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={refetch}
              tintColor={COLORS.green}
              colors={[COLORS.green]}
            />
          }
          ListHeaderComponent={
            <>
              {isError && assignments.length > 0 && (
                <View style={styles.staleNotice}>
                  <Ionicons name="cloud-offline-outline" size={18} color={COLORS.amber} />
                  <View style={styles.noticeCopy}>
                    <Text style={styles.noticeTitle}>Unable to refresh missions</Text>
                    <Text style={styles.noticeDescription}>Showing the assignments currently available on this device.</Text>
                  </View>
                  <TouchableOpacity onPress={() => refetch()} style={styles.noticeRetry} accessibilityRole="button" accessibilityLabel="Retry refresh">
                    <Ionicons name="refresh" size={18} color={COLORS.green} />
                  </TouchableOpacity>
                </View>
              )}
              <View style={styles.sectionHeading}>
                <Text style={styles.sectionTitle}>Your assignments</Text>
                <Text style={styles.sectionMeta}>Select a card for details</Text>
              </View>
              {unknownCount > 0 && (
                <View style={styles.unknownNotice}>
                  <Ionicons name="alert-circle-outline" size={18} color={COLORS.secondary} />
                  <Text style={styles.unknownNoticeText}>
                    {unknownCount === 1 ? 'One assignment has an unconfirmed status.' : `${unknownCount} assignments have unconfirmed statuses.`} Review these before assuming there is no active work.
                  </Text>
                </View>
              )}
            </>
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.stateIcon}>
                <Ionicons name="clipboard-outline" size={32} color={COLORS.green} />
              </View>
              <Text style={styles.stateTitle}>No missions to show</Text>
              <Text style={styles.stateDescription}>There are no assignments in the current response. Pull down to refresh for the latest status.</Text>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => refetch()} activeOpacity={0.8}>
                <Ionicons name="refresh-outline" size={17} color={COLORS.green} />
                <Text style={styles.secondaryButtonText}>Refresh missions</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => (
            <AssignmentCard
              item={item}
              onPress={() => router.push(`/responder/assignment/${item.id}` as never)}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListFooterComponent={<View style={{ height: 20 }} />}
        />
      )}
    </SafeAreaView>
  );
}

function LoadingState() {
  return (
    <View style={styles.loadingContent}>
      <View style={styles.loadingHeading}>
        <ActivityIndicator color={COLORS.green} size="small" />
        <Text style={styles.loadingText}>Loading your assignments…</Text>
      </View>
      {[0, 1, 2].map((key) => (
        <View key={key} style={styles.skeletonCard}>
          <View style={styles.skeletonTop}>
            <View style={styles.skeletonIcon} />
            <View style={{ flex: 1, gap: 8 }}>
              <View style={[styles.skeletonLine, { width: '55%' }]} />
              <View style={[styles.skeletonLine, { width: '38%' }]} />
            </View>
            <View style={styles.skeletonPill} />
          </View>
          <View style={[styles.skeletonLine, { width: '78%', marginTop: 18 }]} />
          <View style={[styles.skeletonLine, { width: '58%', marginTop: 10 }]} />
        </View>
      ))}
    </View>
  );
}

function AssignmentCard({ item, onPress }: { item: Assignment; onPress: () => void }) {
  const incident = item.incidents;
  const unit = item.resources;
  const category = incident?.category;
  const accent = categoryColor(category);
  const priority = String(incident?.priority ?? '').toUpperCase();
  const priorityAccent = priorityColor(incident?.priority);
  const status = getStatus(item);
  const unknown = status.label === 'Assignment status unavailable';
  const address =
    incident?.incident_locations?.formatted_address ??
    ([incident?.incident_locations?.barangay, incident?.incident_locations?.municipality]
      .filter(Boolean)
      .join(', ') || 'Location pending');

  return (
    <TouchableOpacity
      style={[styles.card, { borderLeftWidth: 3, borderLeftColor: accent }]}
      onPress={onPress}
      activeOpacity={0.78}
      accessibilityRole="button"
      accessibilityLabel={`${incident?.public_reference ?? 'Assignment'}, ${titleCase(category ?? 'Incident')}, ${status.label}. Open assignment details.`}
    >
      <View style={styles.cardBody}>
        <View style={styles.cardEyebrowRow}>
          <View style={styles.referenceWrap}>
            <Text style={styles.referenceLabel}>INCIDENT</Text>
            <Text style={styles.reference} numberOfLines={1}>{incident?.public_reference ?? 'Reference unavailable'}</Text>
          </View>
          <View style={[styles.priorityPill, { backgroundColor: `${priorityAccent}14` }]}>
            <View style={[styles.priorityDot, { backgroundColor: priorityAccent }]} />
            <Text style={[styles.priorityText, { color: priorityAccent }]}>
              {priority ? titleCase(priority) : 'Priority unavailable'}
            </Text>
          </View>
        </View>

        <View style={styles.categoryRow}>
          <View style={[styles.categoryIconWrap, { backgroundColor: `${accent}16` }]}>
            <Ionicons name={categoryIcon(category)} size={21} color={accent} />
          </View>
          <View style={styles.categoryCopy}>
            <Text style={styles.categoryTitle} numberOfLines={2}>{titleCase(category ?? 'Incident')}</Text>
            <Text style={styles.unitText} numberOfLines={1}>
              {unit?.call_sign ?? unit?.name ?? 'Responder assignment'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.muted} />
        </View>

        <View style={styles.cardDivider} />

        <View style={styles.detailRow}>
          <Ionicons name="location-outline" size={17} color={COLORS.secondary} />
          <Text style={styles.address} numberOfLines={2}>{address}</Text>
        </View>

        <View style={styles.cardBottomRow}>
          <View style={[styles.statusPill, { backgroundColor: status.background }]}>
            <Ionicons name={status.icon} size={15} color={status.color} />
            <Text style={[styles.statusText, { color: status.color }]} numberOfLines={1}>{status.label}</Text>
          </View>
          <Text style={styles.actionText}>{unknown ? 'Review status' : 'View mission'}</Text>
        </View>

        {unknown && (
          <View style={styles.unknownCardNote}>
            <Ionicons name="information-circle-outline" size={16} color={COLORS.secondary} />
            <Text style={styles.unknownCardNoteText}>The latest assignment status could not be confirmed. Open details or refresh to retry.</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.pearl },

  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    backgroundColor: COLORS.pearl,
  },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  headerLeft:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerRight:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoWrap:     { width: 38, height: 38, borderRadius: 10, backgroundColor: '#0D6053', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logoIcon:     { width: 38, height: 38 },
  logoName:     { fontSize: 15, fontWeight: '800', color: '#1C2B3A', lineHeight: 18 },
  logoOrg:      { fontSize: 11, color: '#8795A3', lineHeight: 15 },
  connPill:     { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1 },
  connDot:      { width: 7, height: 7, borderRadius: 4 },
  connText:     { fontSize: 12, fontWeight: '600' },
  avatarCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EEF7F4', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(13,96,83,0.18)' },
  avatarText:   { fontSize: 13, fontWeight: '800', color: COLORS.green },
  refreshButton: {
    width: 36, height: 36, borderRadius: 12, backgroundColor: COLORS.white,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border,
  },
  pageTitle:     { marginBottom: 16 },
  pageTitleText: { fontSize: 28, fontWeight: '800', color: '#1C2B3A', lineHeight: 33, letterSpacing: -0.5 },
  pageTitleSub:  { fontSize: 13, color: '#8795A3', marginTop: 3 },
  summaryRow: {
    flexDirection: 'row', alignItems: 'center', marginTop: 18, paddingVertical: 13,
    paddingHorizontal: 16, borderRadius: 16, backgroundColor: COLORS.white,
    borderWidth: 1, borderColor: COLORS.border, ...CARD_SHADOW,
  },
  summaryItem: { flex: 1, alignItems: 'flex-start' },
  summaryNumber: { color: COLORS.text, fontSize: 20, lineHeight: 25, fontWeight: '800' },
  summaryLabel: { color: COLORS.secondary, fontSize: 11, marginTop: 2 },
  summaryDivider: { width: 1, height: 30, backgroundColor: COLORS.border, marginHorizontal: 12 },

  listContent: { paddingHorizontal: 16, paddingTop: 2, paddingBottom: 24 },
  sectionHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12, marginTop: 4 },
  sectionTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800' },
  sectionMeta: { color: COLORS.muted, fontSize: 11 },
  staleNotice: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, marginBottom: 14,
    borderRadius: 14, backgroundColor: COLORS.amberSoft, borderWidth: 1, borderColor: '#F5E3BF',
  },
  noticeCopy: { flex: 1 },
  noticeTitle: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
  noticeDescription: { color: COLORS.secondary, fontSize: 12, lineHeight: 17, marginTop: 2 },
  noticeRetry: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center' },
  unknownNotice: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 12, marginBottom: 14,
    borderRadius: 13, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  unknownNoticeText: { flex: 1, color: COLORS.secondary, fontSize: 12, lineHeight: 17 },

  card: {
    backgroundColor: COLORS.white, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border,
    ...CARD_SHADOW,
  },
  cardBody: { padding: 15 },
  cardEyebrowRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  referenceWrap: { flex: 1, minWidth: 0 },
  referenceLabel: { color: COLORS.secondary, fontSize: 10, fontWeight: '800', letterSpacing: 1.1, marginBottom: 4 },
  reference: { color: COLORS.text, fontSize: 15, fontWeight: '800', letterSpacing: 0.1 },
  priorityPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6 },
  priorityDot: { width: 6, height: 6, borderRadius: 3 },
  priorityText: { fontSize: 11, fontWeight: '800' },
  categoryRow: { flexDirection: 'row', alignItems: 'center', marginTop: 15 },
  categoryIconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  categoryCopy: { flex: 1, paddingRight: 8 },
  categoryTitle: { color: COLORS.text, fontSize: 16, lineHeight: 21, fontWeight: '700' },
  unitText: { color: COLORS.secondary, fontSize: 12, marginTop: 3 },
  cardDivider: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border, marginVertical: 14 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  address: { flex: 1, color: COLORS.secondary, fontSize: 13, lineHeight: 19 },
  cardBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 15 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7, maxWidth: '72%' },
  statusText: { fontSize: 12, fontWeight: '700', flexShrink: 1 },
  actionText: { color: COLORS.green, fontSize: 12, fontWeight: '800' },
  unknownCardNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, padding: 10, marginTop: 12, borderRadius: 10, backgroundColor: COLORS.surface },
  unknownCardNoteText: { flex: 1, color: COLORS.secondary, fontSize: 11, lineHeight: 16 },

  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 40 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22, paddingVertical: 48 },
  emptyListContent: { flexGrow: 1 },
  stateIcon: {
    width: 68, height: 68, borderRadius: 22, backgroundColor: COLORS.greenSoft,
    borderWidth: 1, borderColor: '#DCECE7', alignItems: 'center', justifyContent: 'center', marginBottom: 17,
  },
  stateTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  stateDescription: { color: COLORS.secondary, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 7, maxWidth: 300 },
  primaryButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    minHeight: 46, paddingHorizontal: 22, marginTop: 18, borderRadius: 13, backgroundColor: COLORS.green,
  },
  primaryButtonText: { color: COLORS.white, fontSize: 14, fontWeight: '700' },
  secondaryButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    minHeight: 44, paddingHorizontal: 16, marginTop: 18, borderRadius: 12,
    backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border,
  },
  secondaryButtonText: { color: COLORS.green, fontSize: 13, fontWeight: '700' },

  loadingContent: { paddingHorizontal: 16, paddingTop: 8, gap: 12 },
  loadingHeading: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 10 },
  loadingText: { color: COLORS.secondary, fontSize: 13, fontWeight: '600' },
  skeletonCard: {
    backgroundColor: COLORS.white, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border,
    padding: 16, minHeight: 150, ...CARD_SHADOW,
  },
  skeletonTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  skeletonIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: COLORS.surface },
  skeletonLine: { height: 10, borderRadius: 5, backgroundColor: COLORS.surface },
  skeletonPill: { width: 70, height: 25, borderRadius: 8, backgroundColor: COLORS.surface },
});
