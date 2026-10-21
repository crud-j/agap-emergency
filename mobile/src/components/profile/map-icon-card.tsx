import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from '@/src/stores/auth.store';
import { useTranslations } from '@/src/hooks/useAccessibility';
import { updateUserSex } from '@/src/services/api/users.api';
import type { UserSexValue } from '@/src/services/api/auth.api';
import { SexPicker } from './sex-picker';

// Per-user flag so the soft "choose your map icon" prompt is shown at most once.
const mapIconPromptKey = (userId: string) => `agap_map_icon_prompt_dismissed_${userId}`;

/**
 * Optional reporter map icon (Male / Female / Prefer not to say), MOD-01.
 *
 * Saved to the user account (`users.sex` via PATCH /users/me), NOT to the
 * medical profile: it is personal data used only to pick the reporter's icon on
 * the responder's map, so it must not depend on medical-data consent.
 * Renders nothing for guests (no account to save to).
 *
 * `promptOnce`: while the value is unset (null = never asked), highlight the card
 * as a dismissible "Choose your map icon" prompt. PREFER_NOT_TO_SAY is a real
 * answer and is never re-prompted.
 */
export function MapIconCard({ promptOnce = false }: { promptOnce?: boolean }) {
  const t = useTranslations();
  const { user, accessToken, updateUser } = useAuthStore();
  const sex: UserSexValue | null = user?.sex ?? null;
  const canSet = !!user && !user.is_guest && !!accessToken;
  const [saving, setSaving] = useState(false);
  const [promptDismissed, setPromptDismissed] = useState(true);

  useEffect(() => {
    if (!promptOnce || !user?.id) return;
    let cancelled = false;
    SecureStore.getItemAsync(mapIconPromptKey(user.id))
      .then((v) => { if (!cancelled) setPromptDismissed(v === '1'); })
      .catch(() => { /* treat unreadable storage as dismissed — never nag */ });
    return () => { cancelled = true; };
  }, [promptOnce, user?.id]);

  if (!canSet) return null;

  const showPrompt = promptOnce && sex == null && !promptDismissed;

  function dismissPrompt() {
    setPromptDismissed(true);
    if (user?.id) SecureStore.setItemAsync(mapIconPromptKey(user.id), '1').catch(() => {});
  }

  async function change(next: UserSexValue | null) {
    if (!accessToken || saving) return;
    const previous = sex;
    setSaving(true);
    await updateUser({ sex: next }); // optimistic
    try {
      const saved = await updateUserSex(next, accessToken);
      await updateUser({ sex: saved.sex ?? null });
    } catch {
      await updateUser({ sex: previous });
      Alert.alert(t.common.error, t.profile.mapIconSaveError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={[styles.card, showPrompt && styles.cardPrompt]}>
      <View style={styles.header}>
        <Ionicons name="location" size={16} color="#0D6053" style={{ marginRight: 6 }} />
        <Text style={styles.title}>{showPrompt ? t.profile.mapIconPrompt : t.profile.mapIconTitle}</Text>
        {showPrompt && (
          <TouchableOpacity
            onPress={dismissPrompt}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
          >
            <Text style={styles.dismiss}>{t.profile.mapIconDismiss}</Text>
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.body}>
        {showPrompt ? t.profile.mapIconPromptBody : t.registration.sexHelp}
      </Text>
      <SexPicker value={sex} onChange={change} disabled={saving} accessibilityLabel={t.registration.sex} />
      <Text style={styles.note}>{t.profile.mapIconNotMedical}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#DEE7E3' },
  cardPrompt: { borderColor: '#0D6053', backgroundColor: '#F4F9F8' },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  title: { flex: 1, fontSize: 14, fontWeight: '700', color: '#21352F' },
  dismiss: { fontSize: 12, fontWeight: '700', color: '#60736B' },
  body: { fontSize: 12, color: '#78847F', lineHeight: 17, marginBottom: 12 },
  note: { fontSize: 11, color: '#9CA3AF', lineHeight: 15, marginTop: 10 },
});
