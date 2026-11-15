import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/src/stores/auth.store';
import type { Assignment } from '@/src/services/api/responders.api';
import { useResponderAssignments } from '@/src/hooks/useResponderAssignments';
import { priorityColor, priorityLabel, titleCase } from '@/src/lib/incident-visuals';
import { IncidentTypeIcon } from '@/src/components/incidents/incident-type-icon';
import { typeMeta } from '@/src/components/incidents/incident-meta';
import {
  Notice, PageTitle, PressScale, ResponderTopBar, Skeleton, StatePanel,
  responderCard,
} from '@/src/components/responder/ui';
import { colors, radius } from '@/src/theme/tokens';

type IconName = keyof typeof Ionicons.glyphMap;

// One accent: progress states use the brand green, offers amber, transport blue
// (the citizen app's info tone), finished states grey.
const STATUS_STYLES: Record<string, { label: string; color: string; background: string; icon: IconName }> = {
  PENDING: { label: 'Pending offer', color: colors.amberText, background: colors.amberSoft, icon: 'time-outline' },
  SENT: { label: 'Pending offer', color: colors.amberText, background: colors.amberSoft, icon: 'time-outline' },
  ACCEPTED: { label: 'Accepted', color: colors.info, background: colors.infoSoft, icon: 'checkmark-circle-outline' },
  EN_ROUTE: { label: 'En route', color: colors.primary, background: colors.primarySoft, icon: 'navigate-outline' },
  ON_SCENE: { label: 'On scene', color: colors.primary, background: colors.primarySoft, icon: 'location-outline' },
  TRANSPORTING: { label: 'Transporting', color: colors.info, background: colors.infoSoft, icon: 'car-outline' },
  ASSISTING: { label: 'Assisting', color: colors.primary, background: colors.primarySoft, icon: 'people-outline' },
  COMPLETED: { label: 'Completed', color: colors.textMuted, background: colors.surface, icon: 'checkmark-done-outline' },
  CANCELLED: { label: 'Cancelled', color: colors.textMuted, background: colors.surface, icon: 'close-circle-outline' },
  REJECTED: { label: 'Declined', color: colors.textMuted, background: colors.surface, icon: 'close-circle-outline' },
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
    color: colors.textMid,
    background: colors.surface,
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

  const pendingCount = assignments.filter((item) => ['PENDING', 'SENT'].includes(String(item.status ?? '').toUpperCase())).length;
  const unknownCount = assignments.filter((item) => getStatus(item).label === 'Assignment status unavailable').length;

  const refreshButton = (
    <Pressable
      onPress={() => refetch()}
      hitSlop={6}
      style={({ pressed }) => [styles.refreshButton, pressed && { opacity: 0.6 }]}
      accessibilityRole="button"
      accessibilityLabel="Refresh missions"
    >
      {isRefreshing ? (
        <ActivityIndicator color={colors.primary} size="small" />
      ) : (
        <Ionicons name="refresh" size={20} color={colors.primary} />
      )}
    </Pressable>
  );

  const header = (
    <View>
      <ResponderTopBar name={user?.full_name} />
      <PageTitle title="Missions" subtitle="Assignments and incident activity" right={refreshButton} />

      <View style={styles.summaryRow}>
        <SummaryStat value={assignments.length} label="Assignments" />
        <SummaryStat value={pendingCount} label="Pending offers" tone={pendingCount > 0 ? 'amber' : undefined} />
        {unknownCount > 0 && <SummaryStat value={unknownCount} label="Need review" tone="neutral" />}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />

      {isLoading && assignments.length === 0 ? (
        <View style={styles.listContent}>
          {header}
          <LoadingState />
        </View>
      ) : isError && assignments.length === 0 ? (
        <View style={[styles.listContent, { flex: 1 }]}>
          {header}
          <View style={styles.centerState}>
            <StatePanel
              icon="cloud-offline-outline"
              title="Unable to refresh missions"
              body="Check your connection and try loading your assignments again."
              actionLabel="Retry"
              actionIcon="refresh"
              onAction={() => refetch()}
            />
          </View>
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
                tintColor={colors.primary}
                colors={[colors.primary]}
              />
            }
            ListHeaderComponent={
              <>
                {header}
                {isError && assignments.length > 0 && (
                  <Notice
                    icon="cloud-offline-outline"
                    tone="amber"
                    text="Unable to refresh. Showing the assignments on this device."
                    actionLabel="Retry"
                    onAction={() => refetch()}
                  />
                )}
                {unknownCount > 0 && (
                  <Notice
                    icon="alert-circle-outline"
                    tone="neutral"
                    text={`${unknownCount === 1 ? 'One assignment has an unconfirmed status.' : `${unknownCount} assignments have unconfirmed statuses.`} Review these before assuming there is no active work.`}
                  />
                )}
                {assignments.length > 0 && (
                  <View style={styles.sectionHeading}>
                    <Text style={styles.sectionTitle}>YOUR ASSIGNMENTS</Text>
                    <Text style={styles.sectionMeta}>Tap a card for details</Text>
                  </View>
                )}
              </>
            }
            ListEmptyComponent={
              <View style={[responderCard, styles.emptyCard]}>
                <StatePanel
                  icon="clipboard-outline"
                  tone="primary"
                  title="No missions to show"
                  body="There are no assignments in the current response. Pull down to refresh for the latest status."
                  actionLabel="Refresh missions"
                  actionIcon="refresh"
                  onAction={() => refetch()}
                />
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

function SummaryStat({ value, label, tone }: { value: number; label: string; tone?: 'amber' | 'neutral' }) {
  const color = tone === 'amber' ? colors.amberText : tone === 'neutral' ? colors.textMid : colors.text;
  return (
    <View style={[responderCard, styles.summaryItem]}>
      <Text style={[styles.summaryNumber, { color }]}>{value}</Text>
      <Text style={styles.summaryLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function LoadingState() {
  return (
    <View style={{ gap: 12 }}>
      <View style={styles.loadingHeading}>
        <ActivityIndicator color={colors.primary} size="small" />
        <Text style={styles.loadingText}>Loading your assignments…</Text>
      </View>
      {[0, 1, 2].map((key) => (
        <View key={key} style={[responderCard, styles.skeletonCard]}>
          <View style={styles.skeletonTop}>
            <Skeleton height={48} width={48} style={{ borderRadius: 24 }} />
            <View style={{ flex: 1, gap: 8 }}>
              <Skeleton height={12} width="55%" />
              <Skeleton height={10} width="38%" />
            </View>
            <Skeleton height={26} width={72} style={{ borderRadius: 13 }} />
          </View>
          <Skeleton height={10} width="78%" style={{ marginTop: 18 }} />
          <Skeleton height={10} width="58%" style={{ marginTop: 10 }} />
        </View>
      ))}
    </View>
  );
}

function AssignmentCard({ item, onPress }: { item: Assignment; onPress: () => void }) {
  const incident = item.incidents;
  const unit = item.resources;
  const category = incident?.category;
  const meta = typeMeta(category ?? 'OTHER');
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
    <PressScale
      style={[responderCard, styles.card]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${incident?.public_reference ?? 'Assignment'}, ${titleCase(category ?? 'Incident')}, ${status.label}. Open assignment details.`}
    >
      <View style={styles.cardTop}>
        <IncidentTypeIcon type={category ?? 'OTHER'} size={48} />
        <View style={styles.cardTitleWrap}>
          <Text style={styles.categoryTitle} numberOfLines={1}>{category ? meta.label : 'Incident'}</Text>
          <Text style={styles.reference} numberOfLines={1}>
            {incident?.public_reference ?? 'Reference unavailable'}
          </Text>
        </View>
        <View style={[styles.priorityPill, { backgroundColor: `${priorityAccent}14` }]}>
          <View style={[styles.priorityDot, { backgroundColor: priorityAccent }]} />
          <Text style={[styles.priorityText, { color: priorityAccent }]}>
            {priority ? priorityLabel(priority) : 'No priority'}
          </Text>
        </View>
      </View>

      <View style={styles.addressBox}>
        <Ionicons name="location" size={15} color={colors.danger} />
        <Text style={styles.address} numberOfLines={2}>{address}</Text>
      </View>

      <View style={styles.cardBottomRow}>
        <View style={[styles.statusPill, { backgroundColor: status.background }]}>
          <Ionicons name={status.icon} size={14} color={status.color} />
          <Text style={[styles.statusText, { color: status.color }]} numberOfLines={1}>{status.label}</Text>
        </View>
        <Text style={styles.unitText} numberOfLines={1}>
          {unit?.call_sign ?? unit?.name ?? 'Responder assignment'}
        </Text>
        <Ionicons name="chevron-forward" size={18} color="#C4C9D1" />
      </View>

      {unknown && (
        <View style={styles.unknownCardNote}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textMid} />
          <Text style={styles.unknownCardNoteText}>The latest assignment status could not be confirmed. Open details or refresh to retry.</Text>
        </View>
      )}
    </PressScale>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  listContent: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 },
  emptyListContent: { flexGrow: 1 },

  refreshButton: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border,
  },

  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  summaryItem: { flex: 1, paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.lg },
  summaryNumber: { fontSize: 22, lineHeight: 27, fontWeight: '800', fontVariant: ['tabular-nums'] },
  summaryLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '600', marginTop: 1 },

  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, marginTop: 2 },
  sectionTitle: { color: colors.textMuted, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  sectionMeta: { color: colors.textMuted, fontSize: 12 },

  card: { padding: 16 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardTitleWrap: { flex: 1, minWidth: 0 },
  categoryTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  reference: { color: colors.textMuted, fontSize: 13, fontWeight: '700', marginTop: 2, fontVariant: ['tabular-nums'] },
  priorityPill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 26, paddingHorizontal: 10, borderRadius: 13 },
  priorityDot: { width: 7, height: 7, borderRadius: 4 },
  priorityText: { fontSize: 11, fontWeight: '800' },

  addressBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 14,
    padding: 12, borderRadius: radius.md, backgroundColor: colors.bg,
  },
  address: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '600', lineHeight: 19 },

  cardBottomRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingHorizontal: 11, borderRadius: 14, maxWidth: '62%' },
  statusText: { fontSize: 12, fontWeight: '800', flexShrink: 1 },
  unitText: { flex: 1, textAlign: 'right', color: colors.textMuted, fontSize: 12, fontWeight: '600' },

  unknownCardNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, padding: 10, marginTop: 12, borderRadius: radius.md, backgroundColor: colors.surface },
  unknownCardNoteText: { flex: 1, color: colors.textMid, fontSize: 12, lineHeight: 17 },

  centerState: { flex: 1, justifyContent: 'center' },
  emptyCard: { marginTop: 4 },

  loadingHeading: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 4 },
  loadingText: { color: colors.textMid, fontSize: 13, fontWeight: '600' },
  skeletonCard: { padding: 16, minHeight: 150 },
  skeletonTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
