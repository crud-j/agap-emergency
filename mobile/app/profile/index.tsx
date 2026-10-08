import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Linking, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../src/stores/auth.store';
import { useAccessibilityStore } from '../../src/stores/accessibility.store';
import type { Language } from '../../src/stores/accessibility.store';
import { useTranslations } from '../../src/hooks/useAccessibility';
import { logout as logoutApi } from '../../src/services/api/auth.api';
import { updateUserPreferences } from '../../src/services/api/users.api';
import { BottomNav } from '../../src/components/ui/bottom-nav';

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
  const { user, accessToken, logout } = useAuthStore();
  const language = useAccessibilityStore((s) => s.language);
  const setPreferences = useAccessibilityStore((s) => s.setPreferences);

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
            <View style={styles.avatar}>
              <Text style={styles.avatarInitial}>{user?.full_name?.[0]?.toUpperCase() ?? 'U'}</Text>
            </View>
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
            <MenuRow icon="document-text-outline" label={t.profile.history} sub={t.profile.historySub} last onPress={() => router.push('/history')} />
          </View>

          {/* ── Preferences (MOD-04) ──────────────────────────────────── */}
          <SectionHeader title={t.profile.sectionPreferences} />
          <View style={styles.group}>
            <MenuRow icon="language-outline" label={t.profile.language} value={LANG_LABEL[language]} onPress={toggleLanguage} />
            <MenuRow icon="accessibility-outline" label={t.profile.accessibility} sub={t.profile.accessibilitySub} onPress={() => router.push('/profile/accessibility')} />
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7F8FA' },
  scroll: { paddingHorizontal: 16, paddingTop: 4 },

  // Top bar
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, marginTop: 4 },
  topTitle: { fontSize: 26, fontWeight: '800', color: '#111827' },
  langPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: '#F0F7F4', borderWidth: 1, borderColor: '#D7EAE3' },
  langPillText: { fontSize: 13, fontWeight: '600', color: '#0D6053' },

  // Identity card
  identityCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, alignItems: 'center', marginBottom: 16,
    borderWidth: 1, borderColor: '#EEF0F3',
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.05, shadowRadius: 16 }, android: { elevation: 2 } }),
  },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: '#0D6053', alignItems: 'center', justifyContent: 'center', marginBottom: 12, borderWidth: 3, borderColor: '#E7F2EE' },
  avatarInitial: { fontSize: 34, fontWeight: '800', color: '#FFFFFF' },
  name: { fontSize: 22, fontWeight: '800', color: '#111827', marginBottom: 8 },
  roleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  roleBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0F7F4', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  roleBadgeText: { fontSize: 12, fontWeight: '700', color: '#0D6053' },
  memberSince: { fontSize: 12, color: '#9CA3AF' },
  contactBlock: { width: '100%', gap: 8, borderTopWidth: 1, borderTopColor: '#F0F1F4', paddingTop: 14 },
  verifyRow: { flexDirection: 'row', alignItems: 'center' },
  verifyValue: { flex: 1, fontSize: 14, color: '#374151', fontWeight: '500' },
  verifyChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  verifyChipOk: { backgroundColor: '#F0F7F4' },
  verifyChipWarn: { backgroundColor: '#FEF3E2' },
  verifyChipText: { fontSize: 11, fontWeight: '700' },

  // Completeness
  completeCard: { backgroundColor: '#0D6053', borderRadius: 16, padding: 16, marginBottom: 16 },
  completeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  completeTitle: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  completePct: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden', marginBottom: 12 },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: '#FFFFFF' },
  completeCtaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  completeCta: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },

  // Hotlines
  hotlineCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#FBE0E0' },
  hotlineHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  hotlineIconWrap: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FEECEC', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  hotlineTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  call911Btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 48, borderRadius: 24, backgroundColor: '#DC2626', marginBottom: 10 },
  call911Text: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  hotlineNote: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', lineHeight: 16 },

  // Sections + menu groups
  sectionHeader: { fontSize: 13, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8, marginLeft: 4 },
  group: {
    backgroundColor: '#FFFFFF', borderRadius: 16, marginBottom: 20, borderWidth: 1, borderColor: '#EEF0F3', overflow: 'hidden',
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 10 }, android: { elevation: 1 } }),
  },
  menuRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14 },
  menuRowDivider: { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  menuIconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F0F7F4', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  sensitiveDot: { position: 'absolute', top: -3, right: -3, width: 16, height: 16, borderRadius: 8, backgroundColor: '#B45309', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#FFFFFF' },
  menuTextWrap: { flex: 1 },
  menuLabel: { fontSize: 15, fontWeight: '600', color: '#111827' },
  menuSub: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  menuValue: { fontSize: 14, color: '#6B7280', fontWeight: '600', marginRight: 6 },

  // Sign out
  signOutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 52, borderRadius: 26, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#FBD5D5', marginBottom: 16 },
  signOutText: { fontSize: 15, fontWeight: '700', color: '#EF4444' },
  wordmark: { fontSize: 12, color: '#C4C9D1', textAlign: 'center', fontWeight: '600', letterSpacing: 0.3 },
});
