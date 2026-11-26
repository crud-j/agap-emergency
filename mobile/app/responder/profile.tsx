import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert, StatusBar, Linking, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuthStore } from '@/src/stores/auth.store';
import { useTranslations } from '@/src/hooks/useAccessibility';
import { getMe } from '@/src/services/api/users.api';
import { ProfileAvatar } from '@/src/components/profile/profile-avatar';
import { ChangePhotoModal } from '@/src/components/profile/change-photo-modal';
import { photoLockedUntil } from '@/src/lib/profile-photo';
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
  const t = useTranslations();
  const logout = useAuthStore((s) => s.logout);
  const authUser = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const updateUser = useAuthStore((s) => s.updateUser);
  const { data: summary, isLoading, isError, refetch } = useResponderSummary();

  // ── Profile picture (MOD-01): same live selfie and checks as the citizen app ──
  const [photoModal, setPhotoModal] = useState(false);
  const lockedUntil = photoLockedUntil(authUser);

  // Fresh photo fields on every visit: the photo may have changed on another device.
  useFocusEffect(
    useCallback(() => {
      if (!accessToken) return;
      let cancelled = false;
      getMe()
        .then((me) => {
          if (cancelled) return;
          void updateUser({
            has_profile_photo: !!me.has_profile_photo,
            profile_photo_updated_at: me.profile_photo_updated_at ?? null,
            profile_photo_next_change_at: me.profile_photo_next_change_at ?? null,
          });
        })
        .catch(() => { /* keep what we have */ });
      return () => { cancelled = true; };
    }, [accessToken, updateUser]),
  );

  function proceedToSelfie() {
    setPhotoModal(false);
    router.push('/profile/selfie' as never);
  }

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
          <TouchableOpacity
            style={styles.changePhotoBtn}
            activeOpacity={0.7}
            onPress={() => setPhotoModal(true)}
            accessibilityRole="button"
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text style={styles.changePhotoText}>
              {authUser?.has_profile_photo ? t.profilePhoto.change : t.profilePhoto.add}
            </Text>
            <Ionicons name="create-outline" size={14} color="#9FDCC6" style={{ marginLeft: 5 }} />
          </TouchableOpacity>
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
        <ListGroup>
          <ListRow
            icon="finger-print-outline"
            label={t.profile.passkeys}
            sub={t.profile.passkeysSub}
            last
            onPress={() => router.push('/profile/passkeys' as never)}
          />
        </ListGroup>
        <View style={styles.gap} />
        {signOutButton}

        <Text style={styles.footerNote}>AGAP Responder · Bocaue MDRRMO</Text>
      </ScrollView>

      <ChangePhotoModal
        visible={photoModal}
        lockedUntil={lockedUntil}
        onCancel={() => setPhotoModal(false)}
        onProceed={proceedToSelfie}
      />
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
  changePhotoBtn: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 10, backgroundColor: 'rgba(221, 239, 232, 0.12)', borderWidth: 1, borderColor: 'rgba(159, 220, 198, 0.35)',
  },
  changePhotoText: { fontSize: 12.5, fontWeight: '800', color: '#9FDCC6' },
  gap: { height: 12 },
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
