import React, { useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/src/stores/auth.store';
import { useFontScale, useTranslations } from '@/src/hooks/useAccessibility';
import { setResponderPhotoSharing } from '@/src/services/api/users.api';
import { colors, radius } from '@/src/theme/tokens';

/**
 * MOD-01 / MOD-48: "Show my photo to responders". Off by default; a separate consent
 * from taking the photo. When on, the dispatchers and crew of the user's ACTIVE reports
 * see the photo on their map, labelled as the reporter (never the patient).
 * Renders nothing for guests (no account, no photo).
 */
export function PhotoSharingCard() {
  const t = useTranslations().profilePhoto;
  const { fs } = useFontScale();
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const [saving, setSaving] = useState(false);

  if (!user || user.is_guest) return null;

  const shared = !!user.profile_photo_shared_with_responders;
  const hasPhoto = !!user.has_profile_photo;
  // Without a photo there is nothing to share; still let someone who shared turn it off.
  const disabled = saving || (!hasPhoto && !shared);

  async function change(next: boolean) {
    if (saving) return;
    setSaving(true);
    await updateUser({ profile_photo_shared_with_responders: next }); // optimistic
    try {
      const saved = await setResponderPhotoSharing(next);
      await updateUser({ profile_photo_shared_with_responders: saved });
    } catch {
      await updateUser({ profile_photo_shared_with_responders: !next });
      Alert.alert(t.shareTitle, t.shareSaveError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconTile}>
          <Ionicons name="navigate-circle-outline" size={20} color={colors.primary} />
        </View>
        <Text style={[styles.title, { fontSize: fs(15) }]}>{t.shareTitle}</Text>
        <Switch
          value={shared}
          onValueChange={change}
          disabled={disabled}
          trackColor={{ false: colors.track, true: '#8CC5B3' }}
          thumbColor={shared ? colors.primary : colors.white}
          ios_backgroundColor={colors.track}
          accessibilityRole="switch"
          accessibilityLabel={t.shareTitle}
          accessibilityHint={t.shareBody}
          accessibilityState={{ checked: shared, disabled }}
        />
      </View>
      <Text style={[styles.body, { fontSize: fs(13) }]}>{t.shareBody}</Text>
      {!hasPhoto ? (
        <Text style={[styles.hint, { fontSize: fs(12) }]}>{t.shareNoPhoto}</Text>
      ) : (
        <Text style={[styles.note, { fontSize: fs(12) }]}>{t.shareNotPatient}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#E3E9EF',
    padding: 16,
    marginBottom: 16,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconTile: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: colors.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { flex: 1, fontWeight: '700', color: colors.text },
  body: { color: colors.textMid, lineHeight: 19, marginTop: 12 },
  hint: { color: colors.amberText, fontWeight: '600', lineHeight: 17, marginTop: 8 },
  note: { color: colors.textMuted, lineHeight: 17, marginTop: 8 },
});
