import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/src/stores/auth.store';
import type { Assignment } from '@/src/services/api/responders.api';
import { useResponderAssignments } from '@/src/hooks/useResponderAssignments';
import { categoryIcon, categoryColor, priorityColor, titleCase } from '@/src/lib/incident-visuals';

const STATUS_COLOR: Record<string, string> = {
  PENDING:      '#D97706',
  SENT:         '#D97706',
  ACCEPTED:     '#3B82F6',
  EN_ROUTE:     '#0891B2',
  ON_SCENE:     '#0D6053',
  TRANSPORTING: '#7C3AED',
};

const CARD_SHADOW = {
  shadowColor: '#8795A3',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.09,
  shadowRadius: 12,
  elevation: 3,
};

/**
 * Responder assignment queue (MOD-32). Lists the dispatches the logged-in
 * rescuer is crewed on, newest first, and opens the live assignment detail.
 */
export default function AssignmentsScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { assignments, isLoading, isError, isRefreshing, refetch } = useResponderAssignments();
  const activeCount = assignments.length;
  const firstName = user?.full_name?.split(' ')[0] ?? 'Responder';
  const initials = (user?.full_name?.charAt(0) ?? 'R').toUpperCase();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F2F5F8" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
            <View style={styles.onDutyDot} />
          </View>
          <View>
            <Text style={styles.greeting}>On duty, {firstName}</Text>
            <Text style={styles.subtitle}>
              {activeCount > 0
                ? `${activeCount} active assignment${activeCount > 1 ? 's' : ''}`
                : 'Standing by'}
            </Text>
          </View>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={() => refetch()} accessibilityLabel="Refresh">
          {isRefreshing
            ? <ActivityIndicator color="#0D6053" />
            : <Ionicons name="refresh" size={20} color="#8795A3" />}
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#0D6053" size="large" />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <Ionicons name="cloud-offline-outline" size={36} color="#8795A3" />
          </View>
          <Text style={styles.muted}>Could not load assignments.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : assignments.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <Ionicons name="shield-checkmark-outline" size={40} color="#8795A3" />
          </View>
          <Text style={styles.muted}>No active assignments</Text>
          <Text style={styles.mutedSmall}>You'll be notified the moment you're dispatched.</Text>
        </View>
      ) : (
        <FlatList
          data={assignments}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 16, paddingTop: 8 }}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={refetch} tintColor="#0D6053" />
          }
          renderItem={({ item }) => (
            <AssignmentCard
              item={item}
              onPress={() => router.push(`/responder/assignment/${item.id}` as never)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function AssignmentCard({ item, onPress }: { item: Assignment; onPress: () => void }) {
  const incident    = item.incidents;
  const unit        = item.resources;
  const cat         = incident?.category;
  const accent      = categoryColor(cat);
  const statusColor = STATUS_COLOR[item.status] ?? '#8795A3';
  const prioColor   = priorityColor(incident?.priority);
  const address     =
    incident?.incident_locations?.formatted_address ??
    ([incident?.incident_locations?.barangay, incident?.incident_locations?.municipality]
      .filter(Boolean)
      .join(', ') || 'Location pending');

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      {/* Left accent bar by category */}
      <View style={[styles.accent, { backgroundColor: accent }]} />

      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <View style={styles.unitRow}>
            <View style={[styles.catIcon, { backgroundColor: `${accent}18` }]}>
              <Ionicons name={categoryIcon(cat)} size={16} color={accent} />
            </View>
            <Text style={styles.unit}>{unit?.call_sign ?? unit?.name ?? 'Unit'}</Text>
          </View>
          <View style={[styles.statusPill, { backgroundColor: `${statusColor}15` }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>{titleCase(item.status)}</Text>
          </View>
        </View>

        <Text style={styles.type}>{titleCase(incident?.category ?? 'Incident')}</Text>
        <View style={styles.metaRow}>
          <View style={[styles.prioTag, { borderColor: prioColor }]}>
            <Text style={[styles.prioText, { color: prioColor }]}>{titleCase(incident?.priority)}</Text>
          </View>
          <Text style={styles.ref}>{incident?.public_reference ?? ''}</Text>
        </View>

        <View style={styles.addrRow}>
          <Ionicons name="location-outline" size={14} color="#8795A3" style={{ marginRight: 4 }} />
          <Text style={styles.addr} numberOfLines={1}>{address}</Text>
          <Ionicons name="chevron-forward" size={16} color="#8795A3" />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F5F8' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(168,181,193,0.20)',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: '#0D6053',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#0D6053', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  avatarText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  onDutyDot: {
    position: 'absolute', right: -1, bottom: -1, width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#0D6053', borderWidth: 2.5, borderColor: '#FFFFFF',
  },
  greeting: { fontSize: 18, fontWeight: '800', color: '#1C2B3A' },
  subtitle: { fontSize: 13, color: '#8795A3', marginTop: 1 },
  refreshBtn: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#EDF1F4',
    borderWidth: 1, borderColor: 'rgba(168,181,193,0.20)',
  },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 6 },
  emptyIcon: {
    width: 84, height: 84, borderRadius: 42, backgroundColor: '#EDF1F4',
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
    borderWidth: 1, borderColor: 'rgba(168,181,193,0.20)',
  },
  muted: { color: '#1C2B3A', fontSize: 16, fontWeight: '600' },
  mutedSmall: { color: '#8795A3', fontSize: 13, textAlign: 'center' },
  retryBtn: { marginTop: 14, backgroundColor: '#0D6053', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 11 },
  retryText: { color: '#FFFFFF', fontWeight: '700' },

  card: {
    flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 18, marginBottom: 12,
    overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(168,181,193,0.20)',
    ...CARD_SHADOW,
  },
  accent: { width: 5 },
  cardBody: { flex: 1, padding: 15 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  unitRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  catIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  unit: { fontSize: 16, fontWeight: '800', color: '#1C2B3A', letterSpacing: 0.3 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '800' },

  type: { fontSize: 17, fontWeight: '700', color: '#1C2B3A', marginBottom: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  prioTag: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  prioText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  ref: { fontSize: 12, fontFamily: 'monospace', color: '#8795A3' },

  addrRow: { flexDirection: 'row', alignItems: 'center' },
  addr: { fontSize: 13, color: '#40536D', flex: 1 },
});
