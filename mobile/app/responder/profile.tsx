import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/src/stores/auth.store';
import { useResponderSummary } from '@/src/hooks/useResponderSummary';
import { AvailabilityControl } from '@/src/components/responder/availability-control';

const AVAILABILITY_COLOR: Record<string, string> = {
  AVAILABLE:   '#0D6053',
  OFF_DUTY:    '#8795A3',
  UNAVAILABLE: '#D44858',
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

export default function ProfileScreen() {
  const logout = useAuthStore((s) => s.logout);
  const { data: summary, isLoading, isError, refetch } = useResponderSummary();

  function handleLogout() {
    Alert.alert(
      'Sign out',
      'Sign out of AGAP? You will stop receiving assignment notifications.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: () => logout() },
      ],
    );
  }

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

  if (isError) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor="#F2F5F8" />
        <View style={styles.header}>
          <Text style={styles.pageTitle}>Profile</Text>
        </View>
        <View style={styles.center}>
          <View style={styles.iconWrap}>
            <Ionicons name="cloud-offline-outline" size={32} color="#8795A3" />
          </View>
          <Text style={styles.muted}>Could not load profile.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
        {/* Always show logout even when profile fails */}
        <View style={styles.logoutSection}>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color="#D44858" />
            <Text style={styles.logoutText}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const user         = summary!.user;
  const availability = summary!.availability;
  const status       = availability.status;
  const statusColor  = AVAILABILITY_COLOR[status] ?? '#8795A3';
  const statusLabel  = AVAILABILITY_LABEL[status] ?? status.replace('_', ' ');
  const initials     = user.full_name
    ?.split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() ?? '?';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F2F5F8" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        <View style={styles.header}>
          <Text style={styles.pageTitle}>Profile</Text>
        </View>

        {/* Identity card */}
        <View style={styles.card}>
          <View style={styles.identityRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={styles.identityText}>
              <Text style={styles.name}>{user.full_name ?? 'Responder'}</Text>
              <Text style={styles.role}>MDRRMO Responder</Text>
            </View>
          </View>
        </View>

        {/* Duty status */}
        <View style={styles.sectionLabel}>
          <Text style={styles.sectionTitle}>DUTY STATUS</Text>
        </View>
        <View style={styles.card}>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
          <View style={{ marginTop: 12 }}>
            <AvailabilityControl currentStatus={status} />
          </View>
        </View>

        {/* Organizations */}
        {user.organizations.length > 0 && (
          <>
            <View style={styles.sectionLabel}>
              <Text style={styles.sectionTitle}>
                ORGANIZATION{user.organizations.length > 1 ? 'S' : ''}
              </Text>
            </View>
            <View style={styles.card}>
              {user.organizations.map((org, i) => (
                <View
                  key={org.id}
                  style={[styles.orgRow, i < user.organizations.length - 1 && styles.orgRowBorder]}
                >
                  <View style={styles.orgIconWrap}>
                    <Ionicons name="business-outline" size={18} color="#8795A3" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orgName}>{org.name}</Text>
                    {org.position && <Text style={styles.orgPosition}>{org.position}</Text>}
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Account */}
        <View style={styles.sectionLabel}>
          <Text style={styles.sectionTitle}>ACCOUNT</Text>
        </View>
        <View style={styles.card}>
          <TouchableOpacity style={styles.row} onPress={handleLogout}>
            <View style={[styles.rowIconWrap, { backgroundColor: '#FDF0F1', borderColor: 'rgba(212,72,88,0.20)' }]}>
              <Ionicons name="log-out-outline" size={18} color="#D44858" />
            </View>
            <Text style={[styles.rowText, { color: '#D44858' }]}>Sign out</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footerNote}>AGAP Responder · Bocaue MDRRMO</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F5F8' },
  scroll:    { padding: 16, paddingBottom: 32 },

  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  iconWrap:  { width: 72, height: 72, borderRadius: 36, backgroundColor: '#EDF1F4', alignItems: 'center', justifyContent: 'center', marginBottom: 8, borderWidth: 1, borderColor: BEVEL },
  muted:     { color: '#40536D', fontSize: 15 },
  retryBtn:  { marginTop: 12, backgroundColor: '#0D6053', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 11 },
  retryText: { color: '#FFFFFF', fontWeight: '700' },

  header:    { marginBottom: 20 },
  pageTitle: { fontSize: 22, fontWeight: '800', color: '#1C2B3A' },

  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: BEVEL, ...CARD_SHADOW },

  identityRow:  { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar:       { width: 52, height: 52, borderRadius: 26, backgroundColor: '#0D6053', alignItems: 'center', justifyContent: 'center', shadowColor: '#0D6053', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4 },
  avatarText:   { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  identityText: { flex: 1 },
  name:         { fontSize: 18, fontWeight: '800', color: '#1C2B3A' },
  role:         { fontSize: 13, color: '#8795A3', marginTop: 2 },

  sectionLabel: { marginBottom: 8, marginTop: 10 },
  sectionTitle: { fontSize: 11, color: '#8795A3', fontWeight: '700', letterSpacing: 0.9 },

  statusRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  statusDot:  { width: 9, height: 9, borderRadius: 5 },
  statusText: { fontSize: 15, fontWeight: '700' },

  orgRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  orgRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DCE3E9' },
  orgIconWrap:  { width: 34, height: 34, borderRadius: 10, backgroundColor: '#EDF1F4', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: BEVEL },
  orgName:      { fontSize: 14, fontWeight: '700', color: '#1C2B3A' },
  orgPosition:  { fontSize: 12, color: '#8795A3', marginTop: 2 },

  row:         { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowIconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  rowText:     { fontSize: 15, fontWeight: '700' },

  logoutSection: { padding: 16, paddingBottom: 24 },
  logoutBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FDF0F1', borderRadius: 14, paddingVertical: 14, borderWidth: 1, borderColor: 'rgba(212,72,88,0.20)' },
  logoutText:    { color: '#D44858', fontWeight: '700', fontSize: 15 },

  footerNote: { textAlign: 'center', color: '#DCE3E9', fontSize: 12, marginTop: 20 },
});
