import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/src/stores/auth.store';
import { getMyAssignments, type Assignment } from '@/src/services/api/responders.api';
import { categoryIcon, categoryColor, priorityColor, titleCase } from '@/src/lib/incident-visuals';

const STATUS_COLOR: Record<string, string> = {
  PENDING: '#F59E0B',
  SENT: '#F59E0B',
  ACCEPTED: '#3B82F6',
  EN_ROUTE: '#22D3EE',
  ON_SCENE: '#34D399',
  TRANSPORTING: '#A78BFA',
};

/**
 * Responder assignment queue (MOD-32). Lists the dispatches the logged-in
 * rescuer is crewed on, newest first, and opens the live assignment detail.
 */
export default function AssignmentsScreen() {
  const router = useRouter();
  const token = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);

  const { data, isLoading, isError, isRefetching, refetch } = useQuery({
    queryKey: ['responder-assignments'],
    queryFn: () => getMyAssignments(token as string),
    enabled: !!token,
    refetchInterval: 15000,
  });

  const assignments = data ?? [];
  const activeCount = assignments.length;
  const firstName = user?.full_name?.split(' ')[0] ?? 'Responder';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* On-duty header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{firstName.charAt(0).toUpperCase()}</Text>
            <View style={styles.onDutyDot} />
          </View>
          <View>
            <Text style={styles.greeting}>On duty, {firstName}</Text>
            <Text style={styles.subtitle}>
              {activeCount > 0 ? `${activeCount} active assignment${activeCount > 1 ? 's' : ''}` : 'Standing by'}
            </Text>
          </View>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={() => refetch()} accessibilityLabel="Refresh">
          {isRefetching ? <ActivityIndicator color="#34D399" /> : <Ionicons name="refresh" size={20} color="#CBD5E1" />}
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#34D399" />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <View style={styles.emptyIcon}><Ionicons name="cloud-offline-outline" size={36} color="#64748B" /></View>
          <Text style={styles.muted}>Could not load assignments.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : assignments.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.emptyIcon}><Ionicons name="shield-checkmark-outline" size={40} color="#334155" /></View>
          <Text style={styles.muted}>No active assignments</Text>
          <Text style={styles.mutedSmall}>You'll be notified the moment you're dispatched.</Text>
        </View>
      ) : (
        <FlatList
          data={assignments}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 16, paddingTop: 8 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#34D399" />}
          renderItem={({ item }) => (
            <AssignmentCard item={item} onPress={() => router.push(`/responder/assignment/${item.id}` as never)} />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function AssignmentCard({ item, onPress }: { item: Assignment; onPress: () => void }) {
  const incident = item.incidents;
  const unit = item.resources;
  const cat = incident?.category;
  const accent = categoryColor(cat);
  const statusColor = STATUS_COLOR[item.status] ?? '#64748B';
  const prioColor = priorityColor(incident?.priority);
  const address =
    incident?.incident_locations?.formatted_address ??
    ([incident?.incident_locations?.barangay, incident?.incident_locations?.municipality]
      .filter(Boolean)
      .join(', ') ||
      'Location pending');

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      {/* Left accent bar by category */}
      <View style={[styles.accent, { backgroundColor: accent }]} />

      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <View style={styles.unitRow}>
            <View style={[styles.catIcon, { backgroundColor: `${accent}22` }]}>
              <Ionicons name={categoryIcon(cat)} size={16} color={accent} />
            </View>
            <Text style={styles.unit}>{unit?.call_sign ?? unit?.name ?? 'Unit'}</Text>
          </View>
          <View style={[styles.statusPill, { backgroundColor: `${statusColor}22` }]}>
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
          <Ionicons name="location-outline" size={14} color="#64748B" style={{ marginRight: 4 }} />
          <Text style={styles.addr} numberOfLines={1}>{address}</Text>
          <Ionicons name="chevron-forward" size={16} color="#475569" />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1220' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: '#0D6053',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  onDutyDot: {
    position: 'absolute', right: -1, bottom: -1, width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#34D399', borderWidth: 2.5, borderColor: '#0B1220',
  },
  greeting: { fontSize: 18, fontWeight: '800', color: '#F8FAFC' },
  subtitle: { fontSize: 13, color: '#94A3B8', marginTop: 1 },
  refreshBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1E293B' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 6 },
  emptyIcon: {
    width: 84, height: 84, borderRadius: 42, backgroundColor: '#111C2E',
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  muted: { color: '#CBD5E1', fontSize: 16, fontWeight: '600' },
  mutedSmall: { color: '#64748B', fontSize: 13, textAlign: 'center' },
  retryBtn: { marginTop: 14, backgroundColor: '#0D6053', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 11 },
  retryText: { color: '#fff', fontWeight: '700' },

  card: {
    flexDirection: 'row', backgroundColor: '#111C2E', borderRadius: 18, marginBottom: 12,
    overflow: 'hidden', borderWidth: 1, borderColor: '#1E293B',
  },
  accent: { width: 5 },
  cardBody: { flex: 1, padding: 15 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  unitRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  catIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  unit: { fontSize: 16, fontWeight: '800', color: '#F8FAFC', letterSpacing: 0.3 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '800' },

  type: { fontSize: 17, fontWeight: '700', color: '#E2E8F0', marginBottom: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  prioTag: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  prioText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  ref: { fontSize: 12, fontFamily: 'monospace', color: '#64748B' },

  addrRow: { flexDirection: 'row', alignItems: 'center' },
  addr: { fontSize: 13, color: '#94A3B8', flex: 1 },
});
