import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert, StatusBar, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/src/stores/auth.store';
import { ProfileAvatar } from '@/src/components/profile/profile-avatar';
import { useResponderSummary } from '@/src/hooks/useResponderSummary';
import { AvailabilityControl } from '@/src/components/responder/availability-control';
import {
  ListGroup, ListRow, PageTitle, PressScale, ResponderTopBar, SectionLabel, StatePanel, responderCard,
} from '@/src/components/responder/ui';
import { MDRRMO_HOTLINE, MDRRMO_HOTLINE_DISPLAY } from '@/src/config/hotlines';
import { colors, radius } from '@/src/theme/tokens';

const AVAILABILITY: Record<string, { label: string; color: string }> = {
  AVAILABLE:   { label: 'Available',   color: '#5FD3B0' },
  OFF_DUTY:    { label: 'Off Duty',    color: colors.onDeepMuted },
  UNAVAILABLE: { label: 'Unavailable', color: '#FF8A95' },
};

export default function ProfileScreen() {
  const router = useRouter();
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

  const signOutButton = (
    <PressScale style={styles.signOutBtn} onPress={handleLogout} accessibilityRole="button" accessibilityLabel="Sign out">
      <Ionicons name="log-out-outline" size={19} color={colors.dangerStrong} />
      <Text style={styles.signOutText}>Sign out</Text>
    </PressScale>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
        <View style={styles.pad}><ResponderTopBar /></View>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (isError || !summary) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
        <View style={styles.pad}>
          <ResponderTopBar />
          <PageTitle title="Profile" />
        </View>
        <View style={styles.center}>
          <StatePanel
            icon="cloud-offline-outline"
            title="Could not load profile."
            body="Check your connection and try again. You can still sign out."
            actionLabel="Retry"
            actionIcon="refresh"
            onAction={() => refetch()}
          />
        </View>
        {/* Always show logout even when profile fails */}
        <View style={styles.pad}>{signOutButton}</View>
      </SafeAreaView>
    );
  }

  const user         = summary.user;
  const status       = summary.availability.status;
  const avail        = AVAILABILITY[status] ?? { label: status.replace('_', ' '), color: colors.onDeepMuted };
  const initials     = user.full_name
    ?.split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() ?? '?';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <ResponderTopBar name={user.full_name} />
        <PageTitle title="Profile" />

        {/* Identity card — same deep-green surface as the citizen profile */}
        <View style={styles.identityCard}>
          <ProfileAvatar style={styles.avatar} textStyle={styles.avatarText} initial={initials} />
          <Text style={styles.name} numberOfLines={1}>{user.full_name ?? 'Responder'}</Text>
          <View style={styles.roleRow}>
            <View style={styles.roleBadge}>
              <Ionicons name="shield-checkmark" size={12} color={colors.primary} />
              <Text style={styles.roleBadgeText}>MDRRMO Responder</Text>
            </View>
            <View style={styles.statusBadge}>
              <View style={[styles.statusDot, { backgroundColor: avail.color }]} />
              <Text style={styles.statusBadgeText}>{avail.label}</Text>
            </View>
          </View>
        </View>

        {/* Duty status */}
        <SectionLabel title="Duty status" />
        <View style={[responderCard, styles.dutyCard]}>
          <AvailabilityControl currentStatus={status} />
        </View>

        {/* Organizations */}
        {user.organizations.length > 0 && (
          <>
            <SectionLabel title={user.organizations.length > 1 ? 'Organizations' : 'Organization'} />
            <ListGroup>
              {user.organizations.map((org, i) => (
                <ListRow
                  key={org.id}
                  icon="business-outline"
                  label={org.name}
                  sub={org.position ?? undefined}
                  last={i === user.organizations.length - 1}
                />
              ))}
            </ListGroup>
          </>
        )}

        {/* Field references */}
        <SectionLabel title="Field references" />
        <ListGroup>
          <ListRow
            icon="map-outline"
            label="Bocaue coverage map"
            sub="The municipality and all 19 barangays"
            onPress={() => router.push('/coverage' as never)}
          />
          <ListRow
            icon="call-outline"
            label="MDRRMO operations"
            sub="Call the operations center"
            value={MDRRMO_HOTLINE_DISPLAY}
            last
            onPress={() => Linking.openURL(`tel:${MDRRMO_HOTLINE}`).catch(() => undefined)}
            accessibilityLabel={`Call MDRRMO operations, ${MDRRMO_HOTLINE_DISPLAY}`}
          />
        </ListGroup>

        {/* Account */}
        <SectionLabel title="Account" />
        {signOutButton}

        <Text style={styles.footerNote}>AGAP Responder · Bocaue MDRRMO</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  pad:       { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16 },
  scroll:    { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },

  identityCard: {
    alignItems: 'center', padding: 22, marginBottom: 20, borderRadius: radius.xl,
    backgroundColor: colors.primaryDeep, borderWidth: 1, borderColor: '#245248',
    shadowColor: colors.primaryDeep, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 18, elevation: 5,
  },
  avatar: {
    width: 84, height: 84, borderRadius: 42, marginBottom: 12, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#E2F0EA', borderWidth: 3, borderColor: '#DDEFE8',
  },
  avatarText: { fontSize: 30, fontWeight: '800', color: colors.primary },
  name: { fontSize: 23, fontWeight: '800', letterSpacing: -0.4, color: colors.white, marginBottom: 10 },
  roleRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  roleBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5, height: 28, paddingHorizontal: 11, borderRadius: 14,
    backgroundColor: '#DDEFE8',
  },
  roleBadgeText: { fontSize: 12, fontWeight: '800', color: colors.primary },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingHorizontal: 11, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)',
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusBadgeText: { fontSize: 12, fontWeight: '800', color: colors.white },

  dutyCard: { padding: 14, marginBottom: 20 },

  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 52, borderRadius: radius.lg, backgroundColor: colors.white,
    borderWidth: 1, borderColor: '#F0D8D5',
  },
  signOutText: { color: colors.dangerStrong, fontWeight: '800', fontSize: 15 },

  footerNote: { textAlign: 'center', color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.7, marginTop: 20 },
});
