import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Linking, Platform, Switch,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../src/stores/auth.store';
import { useAccessibilityStore } from '../../src/stores/accessibility.store';
import type { Language } from '../../src/stores/accessibility.store';
import { useTranslations } from '../../src/hooks/useAccessibility';
import { logout as logoutApi } from '../../src/services/api/auth.api';
import { getMe, updateUserPreferences } from '../../src/services/api/users.api';
import { ChangePhotoModal } from '../../src/components/profile/change-photo-modal';
import { ProfileAvatar } from '../../src/components/profile/profile-avatar';
import { formatPhotoDate, photoLockedUntil } from '../../src/lib/profile-photo';
import { BottomNav } from '../../src/components/ui/bottom-nav';
import { PhotoSharingCard } from '../../src/components/profile/photo-sharing-card';
import { VerifiedReporterBadge } from '../../src/components/reporter/verified-reporter';
import { IdStatusCard } from '../../src/components/profile/id-status-card';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const LANG_LABEL: Record<Language, string> = { en: 'English', fil: 'Filipino' };

function formatMonthYear(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useTranslations();
  const { user, accessToken, logout, updateUser } = useAuthStore();
  const language = useAccessibilityStore((s) => s.language);
  const shakeToAlert = useAccessibilityStore((s) => s.shakeToAlert);
  const setPreferences = useAccessibilityStore((s) => s.setPreferences);

  // ── Profile picture (MOD-01) ──────────────────────────────────────────────
  const [photoModal, setPhotoModal] = useState(false);
  const canHavePhoto = !!user && !user.is_guest;
  const lockedUntil = photoLockedUntil(user);

  // Fresh photo fields on every visit: the photo may have changed on another device.
  useEffect(() => {
    if (!accessToken || !canHavePhoto) return;
    let cancelled = false;
    getMe()
      .then((me) => {
        if (cancelled) return;
        void updateUser({
          has_profile_photo: !!me.has_profile_photo,
          profile_photo_updated_at: me.profile_photo_updated_at ?? null,
          profile_photo_next_change_at: me.profile_photo_next_change_at ?? null,
          profile_photo_shared_with_responders: !!me.profile_photo_shared_with_responders,
        });
      })
      .catch(() => { /* keep what we have */ });
    return () => { cancelled = true; };
  }, [accessToken, canHavePhoto, updateUser]);

  function proceedToSelfie() {
    setPhotoModal(false);
    router.push('/profile/selfie' as never);
  }

  const completeness = user?.profile_completeness ?? 0;
  const roleLabel = user?.is_guest
    ? t.profile.guest
    : user?.role === 'CITIZEN'
      ? t.profile.role
      : (user?.role ?? t.profile.role);

  // ── Backend-preserving actions ────────────────────────────────────────────
  function confirmSignOut() {
    Alert.alert(t.profile.signOutTitle, t.profile.signOutBody, [
      { text: t.profile.cancel, style: 'cancel' },
      { text: t.profile.signOut, style: 'destructive', onPress: handleLogout },
    ]);
  }

  async function handleLogout() {
    // Unchanged backend behaviour: best-effort server revoke, then clear the
    // local session and return to login.
    if (accessToken) {
      try { await logoutApi(accessToken); } catch { /* best-effort */ }
    }
    await logout();
    router.replace('/auth/login');
  }

  async function toggleLanguage() {
    const next: Language = language === 'en' ? 'fil' : 'en';
    await setPreferences({ language: next }); // local + secure-store (always works)
    if (accessToken) {
      // Best-effort server sync (MOD-04). Never blocks the UI.
      try { await updateUserPreferences({ preferredLanguage: next }, accessToken); } catch { /* offline-safe */ }
    }
  }

  async function handleShakeToAlertChange(value: boolean) {
    await setPreferences({ shakeToAlert: value });
  }

  function call911() {
    Linking.openURL('tel:911').catch(() => Alert.alert(t.common.error));
  }

  const bottomPad = insets.bottom + 120; // clear the floating bottom nav

  return (
    <View style={styles.root}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad }]}
        >
          {/* ── Top bar ───────────────────────────────────────────────── */}
          <View style={styles.topBar}>
            <Text style={styles.topTitle}>{t.profile.title}</Text>
            <TouchableOpacity style={styles.langPill} activeOpacity={0.7} onPress={toggleLanguage}>
              <Ionicons name="language-outline" size={15} color="#0D6053" />
              <Text style={styles.langPillText}>{LANG_LABEL[language]}</Text>
            </TouchableOpacity>
          </View>

          {/* ── Identity card ─────────────────────────────────────────── */}
          <View style={styles.identityCard}>
            <ProfileAvatar
              style={styles.avatar}
              textStyle={styles.avatarInitial}
              initial={user?.full_name?.[0]?.toUpperCase() ?? 'U'}
            />
            {canHavePhoto && (
              <TouchableOpacity
                style={styles.changePhotoBtn}
                activeOpacity={0.7}
                onPress={() => setPhotoModal(true)}
                accessibilityRole="button"
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Text style={styles.changePhotoText}>
                  {user?.has_profile_photo ? t.profilePhoto.change : t.profilePhoto.add}
                </Text>
                <Ionicons name="create-outline" size={14} color="#9FDCC6" style={{ marginLeft: 5 }} />
              </TouchableOpacity>
            )}
            <Text style={styles.name} numberOfLines={1}>{user?.full_name ?? ''}</Text>

            <View style={styles.roleRow}>
              <View style={styles.roleBadge}>
                <Ionicons name="shield-checkmark" size={12} color="#0D6053" style={{ marginRight: 4 }} />
                <Text style={styles.roleBadgeText}>{roleLabel}</Text>
              </View>
              {!!user?.created_at && (
                <Text style={styles.memberSince}>
                  {t.profile.memberSince.replace('{date}', formatMonthYear(user.created_at))}
                </Text>
              )}
            </View>

            {/* Contact + verification */}
            <View style={styles.contactBlock}>
              {!!user?.phone_number && (
                <VerifyRow icon="call-outline" value={user.phone_number} verified={!!user?.is_phone_verified} label={t.profile.phoneVerified} verifyText={t.profile.verify} />
              )}
              {!!user?.email && (
                <VerifyRow icon="mail-outline" value={user.email} verified={!!user?.is_email_verified} label={t.profile.emailVerified} verifyText={t.profile.verify} />
              )}
            </View>
          </View>

          {!user?.is_guest && user?.role === 'CITIZEN' && <VerifiedReporterBadge />}
          {!user?.is_guest && user?.role === 'CITIZEN' && <IdStatusCard />}

          {/* ── Profile completeness ──────────────────────────────────── */}
          {completeness < 100 ? (
            <TouchableOpacity style={styles.completeCard} activeOpacity={0.85} onPress={() => router.push('/contacts')}>
              <View style={styles.completeHeader}>
                <Text style={styles.completeTitle}>{t.profile.completeTitle}</Text>
                <Text style={styles.completePct}>{completeness}%</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.max(completeness, 4)}%` }]} />
              </View>
              <View style={styles.completeCtaRow}>
                <Text style={styles.completeCta}>{t.profile.completeCta}</Text>
                <Ionicons name="arrow-forward" size={14} color="#0D6053" />
              </View>
            </TouchableOpacity>
          ) : null}

          {/* ── Responder map photo (separate consent, MOD-01/48) ─────── */}
          <PhotoSharingCard />

          {/* ── Emergency hotlines (safety — rule 9) ──────────────────── */}
          <View style={styles.hotlineCard}>
            <View style={styles.hotlineHeader}>
              <View style={styles.hotlineIconWrap}>
                <Ionicons name="call" size={18} color="#DC2626" />
              </View>
              <Text style={styles.hotlineTitle}>{t.profile.hotlinesTitle}</Text>
            </View>
            <TouchableOpacity style={styles.call911Btn} activeOpacity={0.85} onPress={call911}>
              <Ionicons name="call" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.call911Text}>{t.profile.call911}</Text>
            </TouchableOpacity>
            <Text style={styles.hotlineNote}>{t.profile.hotlinesNote}</Text>
          </View>

          {/* ── Account & Safety (Cluster A) ──────────────────────────── */}
          <SectionHeader title={t.profile.sectionAccount} />
          <View style={styles.group}>
            <MenuRow icon="people-outline" label={t.profile.emergencyContacts} sub={t.profile.emergencyContactsSub} onPress={() => router.push('/contacts')} />
            <MenuRow icon="pulse-outline" label={t.profile.medicalProfile} sub={t.profile.medicalProfileSub} sensitive onPress={() => router.push('/medical')} />
            <MenuRow icon="shield-checkmark-outline" label={t.profile.readiness} sub={t.profile.readinessSub} onPress={() => router.push('/settings/permissions')} />
            {!user?.is_guest && (
              <MenuRow icon="finger-print-outline" label={t.profile.passkeys} sub={t.profile.passkeysSub} onPress={() => router.push('/profile/passkeys')} />
            )}
          </View>

          {/* ── Resident archives ─────────────────────────────────────── */}
          <SectionHeader title={t.profile.sectionArchive} />
          <View style={styles.group}>
            <MenuRow
              icon="document-text-outline"
              label={t.profile.history}
              sub={t.profile.historySub}
              onPress={() => router.push({ pathname: '/archive', params: { tab: 'incidents' } } as never)}
            />
            <MenuRow
              icon="megaphone-outline"
              label={t.profile.announcementArchive}
              sub={t.profile.announcementArchiveSub}
              last
              onPress={() => router.push({ pathname: '/archive', params: { tab: 'announcements' } } as never)}
            />
          </View>

          {/* ── Preferences (MOD-04) ──────────────────────────────────── */}
          <SectionHeader title={t.profile.sectionPreferences} />
          <View style={styles.group}>
            <MenuRow icon="language-outline" label={t.profile.language} value={LANG_LABEL[language]} onPress={toggleLanguage} />
            <MenuRow icon="accessibility-outline" label={t.profile.accessibility} sub={t.profile.accessibilitySub} onPress={() => router.push('/profile/accessibility')} />
            <SettingRow
              icon="phone-portrait-outline"
              label={t.onboarding4.shakeToAlert.title}
              sub={t.onboarding4.shakeToAlert.subtitle}
              value={shakeToAlert}
              onChange={handleShakeToAlertChange}
            />
            <MenuRow icon="notifications-outline" label={t.profile.notifications} sub={t.profile.notificationsSub} onPress={() => router.push('/notifications')} />
            <MenuRow icon="medical-outline" label={t.profile.firstAid} sub={t.profile.firstAidSub} last onPress={() => router.push('/first-aid')} />
          </View>

          {/* ── Support & Legal ───────────────────────────────────────── */}
          <SectionHeader title={t.profile.sectionSupport} />
          <View style={styles.group}>
            <MenuRow icon="lock-closed-outline" label={t.profile.privacy} sub={t.profile.privacySub} sensitive onPress={() => router.push('/profile/privacy')} />
            <MenuRow icon="help-circle-outline" label={t.profile.help} sub={t.profile.helpSub} onPress={() => router.push('/profile/help')} />
            <MenuRow icon="information-circle-outline" label={t.profile.about} sub={t.profile.aboutSub} last onPress={() => router.push('/profile/about')} />
          </View>

          {/* ── Sign out ──────────────────────────────────────────────── */}
          <TouchableOpacity style={styles.signOutBtn} activeOpacity={0.85} onPress={confirmSignOut}>
            <Ionicons name="log-out-outline" size={18} color="#EF4444" style={{ marginRight: 8 }} />
            <Text style={styles.signOutText}>{t.profile.signOut}</Text>
          </TouchableOpacity>

          <Text style={styles.wordmark}>AGAP · Bocaue MDRRMO</Text>
        </ScrollView>
      </SafeAreaView>

      <BottomNav />

      <ChangePhotoModal
        visible={photoModal}
        lockedUntil={lockedUntil ? formatPhotoDate(lockedUntil, language) : null}
        onCancel={() => setPhotoModal(false)}
        onProceed={proceedToSelfie}
      />
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function VerifyRow({
  icon, value, verified, label, verifyText,
}: {
  icon: IconName; value: string; verified: boolean; label: string; verifyText: string;
}) {
  return (
    <View style={styles.verifyRow}>
      <Ionicons name={icon} size={16} color="#6B7280" style={{ marginRight: 8 }} />
      <Text style={styles.verifyValue} numberOfLines={1}>{value}</Text>
      <View style={[styles.verifyChip, verified ? styles.verifyChipOk : styles.verifyChipWarn]}>
        <Ionicons
          name={verified ? 'checkmark-circle' : 'alert-circle-outline'}
          size={12}
          color={verified ? '#0D6053' : '#B45309'}
          style={{ marginRight: 3 }}
        />
        <Text style={[styles.verifyChipText, { color: verified ? '#0D6053' : '#B45309' }]}>
          {verified ? label : verifyText}
        </Text>
      </View>
    </View>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

function MenuRow({
  icon, label, sub, value, sensitive, last, onPress,
}: {
  icon: IconName; label: string; sub?: string; value?: string; sensitive?: boolean; last?: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.menuRow, !last && styles.menuRowDivider]}
      activeOpacity={0.6}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.menuIconWrap}>
        <Ionicons name={icon} size={20} color="#0D6053" />
        {sensitive && (
          <View style={styles.sensitiveDot}>
            <Ionicons name="lock-closed" size={8} color="#FFFFFF" />
          </View>
        )}
      </View>
      <View style={styles.menuTextWrap}>
        <Text style={styles.menuLabel}>{label}</Text>
        {!!sub && <Text style={styles.menuSub} numberOfLines={1}>{sub}</Text>}
      </View>
      {!!value && <Text style={styles.menuValue}>{value}</Text>}
      <Ionicons name="chevron-forward" size={18} color="#C4C9D1" />
    </TouchableOpacity>
  );
}

function SettingRow({
  icon, label, sub, value, onChange,
}: {
  icon: IconName;
  label: string;
  sub: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={[styles.menuRow, styles.menuRowDivider]}>
      <View style={styles.menuIconWrap}>
        <Ionicons name={icon} size={20} color="#0D6053" />
      </View>
      <View style={styles.menuTextWrap}>
        <Text style={styles.menuLabel}>{label}</Text>
        <Text style={styles.menuSub}>{sub}</Text>
      </View>
      <Switch
        style={styles.settingSwitch}
        value={value}
        onValueChange={onChange}
        trackColor={{ false: '#D7DEDB', true: '#8CC5B3' }}
        thumbColor={value ? '#0D6053' : '#FFFFFF'}
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityState={{ checked: value }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F3F6F5' },
  scroll: { paddingHorizontal: 20, paddingTop: 8 },

  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, marginTop: 4 },
  topTitle: { fontSize: 29, fontWeight: '800', color: '#14231F', letterSpacing: -0.7 },
  langPill: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCE5E1' },
  langPillText: { fontSize: 12, fontWeight: '700', color: '#0D6053' },

  identityCard: {
    backgroundColor: '#12362F', borderRadius: 22, padding: 22, alignItems: 'center', marginBottom: 18,
    borderWidth: 1, borderColor: '#245248',
    ...Platform.select({ ios: { shadowColor: '#12362F', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.16, shadowRadius: 18 }, android: { elevation: 4 } }),
  },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#E2F0EA', alignItems: 'center', justifyContent: 'center', marginBottom: 10, borderWidth: 3, borderColor: '#DDEFE8', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitial: { fontSize: 34, fontWeight: '800', color: '#0D6053' },
  changePhotoBtn: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 10, backgroundColor: 'rgba(221, 239, 232, 0.12)', borderWidth: 1, borderColor: 'rgba(159, 220, 198, 0.35)',
  },
  changePhotoText: { fontSize: 12.5, fontWeight: '800', color: '#9FDCC6' },
  name: { fontSize: 23, fontWeight: '800', color: '#FFFFFF', marginBottom: 9, letterSpacing: -0.4 },
  roleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 9, marginBottom: 18 },
  roleBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#DDEFE8', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9 },
  roleBadgeText: { fontSize: 11, fontWeight: '800', color: '#0D6053' },
  memberSince: { fontSize: 12, color: '#B7CEC6', fontWeight: '500' },
  contactBlock: { width: '100%', gap: 11, borderTopWidth: 1, borderTopColor: '#31574E', paddingTop: 16 },
  verifyRow: { flexDirection: 'row', alignItems: 'center' },
  verifyValue: { flex: 1, fontSize: 13, color: '#F0F6F3', fontWeight: '500', marginRight: 8 },
  verifyChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 },
  verifyChipOk: { backgroundColor: '#DDEFE8' },
  verifyChipWarn: { backgroundColor: '#FFF0D7' },
  verifyChipText: { fontSize: 10, fontWeight: '800' },

  completeCard: { backgroundColor: '#FFFFFF', borderRadius: 17, padding: 17, marginBottom: 18, borderWidth: 1, borderColor: '#DEE7E3' },
  completeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  completeTitle: { fontSize: 14, fontWeight: '700', color: '#21352F' },
  completePct: { fontSize: 13, fontWeight: '800', color: '#0D6053' },
  progressTrack: { height: 7, borderRadius: 4, backgroundColor: '#E5EEEA', overflow: 'hidden', marginBottom: 13 },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: '#0D7461' },
  completeCtaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  completeCta: { fontSize: 13, fontWeight: '700', color: '#0D6053' },

  hotlineCard: { backgroundColor: '#FFFDFC', borderRadius: 17, padding: 17, marginBottom: 22, borderWidth: 1, borderColor: '#F2D9D5' },
  hotlineHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  hotlineIconWrap: { width: 36, height: 36, borderRadius: 11, backgroundColor: '#FDEBE8', alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  hotlineTitle: { fontSize: 15, fontWeight: '800', color: '#25332F' },
  call911Btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 50, borderRadius: 12, backgroundColor: '#C92F2A', marginBottom: 11 },
  call911Text: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  hotlineNote: { fontSize: 12, color: '#78847F', textAlign: 'center', lineHeight: 17 },

  sectionHeader: { fontSize: 11, fontWeight: '800', color: '#71817A', textTransform: 'uppercase', letterSpacing: 1.05, marginBottom: 9, marginLeft: 3 },
  group: {
    backgroundColor: '#FFFFFF', borderRadius: 17, marginBottom: 22, borderWidth: 1, borderColor: '#E1E8E5', overflow: 'hidden',
    ...Platform.select({ ios: { shadowColor: '#183A31', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 10 }, android: { elevation: 1 } }),
  },
  menuRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13 },
  menuRowDivider: { borderBottomWidth: 1, borderBottomColor: '#EEF2F0' },
  menuIconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#EEF6F2', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  sensitiveDot: { position: 'absolute', top: -3, right: -3, width: 16, height: 16, borderRadius: 8, backgroundColor: '#B45309', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#FFFFFF' },
  menuTextWrap: { flex: 1 },
  menuLabel: { fontSize: 14, fontWeight: '700', color: '#1F302A' },
  menuSub: { fontSize: 11, color: '#7C8983', marginTop: 3, lineHeight: 15 },
  settingSwitch: { transform: [{ scaleX: 0.88 }, { scaleY: 0.88 }], marginLeft: 8 },
  menuValue: { fontSize: 12, color: '#60736B', fontWeight: '700', marginRight: 7 },

  signOutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 52, borderRadius: 13, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F0D8D5', marginBottom: 18 },
  signOutText: { fontSize: 14, fontWeight: '800', color: '#C83A34' },
  wordmark: { fontSize: 11, color: '#97A49E', textAlign: 'center', fontWeight: '700', letterSpacing: 0.7 },
});
