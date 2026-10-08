import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ScreenHeader } from '../../src/components/ui/screen-header';
import { useTranslations } from '../../src/hooks/useAccessibility';
import { useAuthStore } from '../../src/stores/auth.store';
import {
  listPasskeys,
  passkeyBeginRegistration,
  passkeyCompleteRegistration,
  revokePasskey,
} from '../../src/services/api/auth.api';
import type { PasskeyCredential } from '../../src/services/api/auth.api';
import {
  createPasskey,
  defaultDeviceLabel,
  isPasskeySupported,
  PasskeyError,
} from '../../src/services/passkey/passkey.service';

function formatDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

type Banner = { kind: 'ok' | 'error' | 'info'; text: string } | null;

// MOD-01 — create and manage the passkeys used to sign in to AGAP.
export default function PasskeysScreen() {
  const router = useRouter();
  const t = useTranslations();
  const { user, accessToken, logout } = useAuthStore();
  const [supported] = useState(isPasskeySupported);

  const [credentials, setCredentials] = useState<PasskeyCredential[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner>(null);

  const isGuest = !!user?.is_guest;

  // A 401 means the access token expired; there is no silent refresh on this
  // screen, so send the user back to sign in rather than failing quietly.
  const handleUnauthorized = useCallback(async () => {
    Alert.alert(t.passkeys.sessionExpired);
    await logout();
    router.replace('/auth/login');
  }, [logout, router, t]);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoadingList(true);
    try {
      setCredentials(await listPasskeys(accessToken));
    } catch (e: any) {
      if (e?.status === 401) { await handleUnauthorized(); return; }
      setBanner({ kind: 'error', text: t.passkeys.loadFailed });
    } finally {
      setIsLoadingList(false);
    }
  }, [accessToken, handleUnauthorized, t]);

  useEffect(() => { void load(); }, [load]);

  async function handleCreate() {
    if (!accessToken) return;
    setBanner(null);
    setIsCreating(true);
    const deviceLabel = defaultDeviceLabel();
    try {
      const { challengeId, options } = await passkeyBeginRegistration(accessToken, deviceLabel);
      const response = await createPasskey(options);
      await passkeyCompleteRegistration(accessToken, { challengeId, response, deviceLabel });
      setBanner({ kind: 'ok', text: t.passkeys.created });
      await load();
    } catch (e: any) {
      if (e instanceof PasskeyError) {
        if (e.reason === 'cancelled') return;
        const text = e.reason === 'unsupported'
          ? t.passkeys.unsupported
          : e.reason === 'already-exists'
            ? t.passkeys.alreadyExists
            : t.passkeys.failed;
        setBanner({ kind: 'error', text });
        return;
      }
      if (e?.status === 401) { await handleUnauthorized(); return; }
      if (e?.status === 403) { setBanner({ kind: 'error', text: t.passkeys.guestNotAllowed }); return; }
      setBanner({ kind: 'error', text: e?.status === undefined ? t.login.errorNetwork : t.passkeys.failed });
    } finally {
      setIsCreating(false);
    }
  }

  function confirmRemove(cred: PasskeyCredential) {
    Alert.alert(t.passkeys.removeTitle, t.passkeys.removeBody, [
      { text: t.profile.cancel, style: 'cancel' },
      { text: t.passkeys.remove, style: 'destructive', onPress: () => void handleRemove(cred.id) },
    ]);
  }

  async function handleRemove(id: string) {
    if (!accessToken) return;
    setBanner(null);
    setRemovingId(id);
    try {
      await revokePasskey(accessToken, id);
      setCredentials((list) => list.filter((c) => c.id !== id));
    } catch (e: any) {
      if (e?.status === 401) { await handleUnauthorized(); return; }
      setBanner({ kind: 'error', text: e?.status === undefined ? t.login.errorNetwork : t.common.error });
    } finally {
      setRemovingId(null);
    }
  }

  const canCreate = supported && !isGuest && !isCreating;

  return (
    <View style={styles.root}>
      <ScreenHeader title={t.passkeys.title} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Intro */}
        <View style={styles.introCard}>
          <View style={styles.introIcon}>
            <Ionicons name="finger-print" size={28} color="#0D6053" />
          </View>
          <Text style={styles.introText}>{t.passkeys.intro}</Text>
        </View>

        {!supported && <Notice kind="info" text={t.passkeys.unsupported} />}
        {supported && isGuest && <Notice kind="info" text={t.passkeys.guestNotAllowed} />}
        {banner && <Notice kind={banner.kind} text={banner.text} />}

        {/* Create */}
        <TouchableOpacity
          style={[styles.createBtn, !canCreate && styles.createBtnDisabled]}
          activeOpacity={0.85}
          onPress={handleCreate}
          disabled={!canCreate}
          accessibilityRole="button"
          accessibilityLabel={t.passkeys.create}
        >
          {isCreating ? (
            <>
              <ActivityIndicator color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.createText}>{t.passkeys.creating}</Text>
            </>
          ) : (
            <>
              <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.createText}>{t.passkeys.create}</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Existing passkeys */}
        <Text style={styles.sectionHeader}>{t.passkeys.listTitle}</Text>
        <View style={styles.group}>
          {isLoadingList ? (
            <ActivityIndicator color="#0D6053" style={{ paddingVertical: 24 }} />
          ) : credentials.length === 0 ? (
            <Text style={styles.empty}>{t.passkeys.empty}</Text>
          ) : (
            credentials.map((cred, i) => (
              <View key={cred.id} style={[styles.credRow, i < credentials.length - 1 && styles.credRowDivider]}>
                <View style={styles.credIcon}>
                  <Ionicons name="key-outline" size={20} color="#0D6053" />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.credTitleRow}>
                    <Text style={styles.credLabel} numberOfLines={1}>
                      {cred.device_label ?? t.passkeys.title}
                    </Text>
                    {cred.is_backed_up && (
                      <View style={styles.syncChip}>
                        <Ionicons name="cloud-done-outline" size={11} color="#0D6053" style={{ marginRight: 3 }} />
                        <Text style={styles.syncChipText}>{t.passkeys.synced}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.credMeta}>
                    {t.passkeys.added.replace('{date}', formatDate(cred.created_at))}
                    {' · '}
                    {cred.last_used_at
                      ? t.passkeys.lastUsed.replace('{date}', formatDate(cred.last_used_at))
                      : t.passkeys.neverUsed}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.removeBtn}
                  onPress={() => confirmRemove(cred)}
                  disabled={removingId === cred.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${t.passkeys.remove} ${cred.device_label ?? ''}`}
                >
                  {removingId === cred.id
                    ? <ActivityIndicator size="small" color="#EF4444" />
                    : <Ionicons name="trash-outline" size={20} color="#EF4444" />}
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function Notice({ kind, text }: { kind: 'ok' | 'error' | 'info'; text: string }) {
  const palette = {
    ok: { bg: '#F0F7F4', border: '#D7EAE3', color: '#0D6053', icon: 'checkmark-circle-outline' },
    error: { bg: '#FEF2F2', border: '#FECACA', color: '#B91C1C', icon: 'alert-circle-outline' },
    info: { bg: '#FEF3E2', border: '#FCE3BD', color: '#B45309', icon: 'information-circle-outline' },
  }[kind] as { bg: string; border: string; color: string; icon: React.ComponentProps<typeof Ionicons>['name'] };
  return (
    <View
      style={[styles.notice, { backgroundColor: palette.bg, borderColor: palette.border }]}
      accessibilityLiveRegion="polite"
    >
      <Ionicons name={palette.icon} size={16} color={palette.color} style={{ marginRight: 8, marginTop: 1 }} />
      <Text style={[styles.noticeText, { color: palette.color }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7F8FA' },
  scroll: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 },

  introCard: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18, alignItems: 'center', marginBottom: 16,
    borderWidth: 1, borderColor: '#EEF0F3',
  },
  introIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#F0F7F4', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  introText: { fontSize: 14, color: '#374151', textAlign: 'center', lineHeight: 21 },

  notice: { flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 16 },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '500' },

  createBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 52, borderRadius: 26, backgroundColor: '#0D6053', marginBottom: 24 },
  createBtnDisabled: { opacity: 0.45 },
  createText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },

  sectionHeader: { fontSize: 13, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8, marginLeft: 4 },
  group: {
    backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#EEF0F3', overflow: 'hidden',
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 10 }, android: { elevation: 1 } }),
  },
  empty: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', paddingVertical: 24 },
  credRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14 },
  credRowDivider: { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  credIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F0F7F4', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  credTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  credLabel: { flexShrink: 1, fontSize: 15, fontWeight: '600', color: '#111827' },
  credMeta: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  syncChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0F7F4', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  syncChipText: { fontSize: 10, fontWeight: '700', color: '#0D6053' },
  removeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
